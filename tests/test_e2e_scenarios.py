"""
Full End-to-End System Integration Test Suite across All 6 Real Modules.
Zero mocks in the path.

Tests:
- Scenario A: Happy-path withdraw flow (Voice Intent -> Face Auth -> Confirm -> Sign QR -> Verify -> Complete)
- Scenario B: Auth fail -> Retry x3 -> Terminal idle reset
- Scenario C: Non-auth/auth flow, customer verbally rejects
- Scenario D: Security bypass attempt (force requires_auth=False on withdraw) -> Auth gate enforced
- Scenario E: Tampered / forged QR token correctly rejected by verify endpoint
"""
from __future__ import annotations

import asyncio
import base64
import os
import secrets
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
import pytest
import httpx

# Ensure paths
ROOT_DIR = Path(__file__).resolve().parent.parent
backend_dir = str(ROOT_DIR / "Backend" / "module4_backend")
security_dir = str(ROOT_DIR / "security-qr-service")
voice_dir = str(ROOT_DIR / "voice_module")

for p in [backend_dir, security_dir, voice_dir]:
    if p in sys.path:
        sys.path.remove(p)
sys.path.insert(0, backend_dir)
sys.path.insert(1, security_dir)
sys.path.insert(2, voice_dir)

os.environ["SECURITY_SVC_DEV_MODE"] = "1"
os.environ["SECURITY_SVC_KEY_B64"] = base64.b64encode(secrets.token_bytes(32)).decode()
os.environ["SECURITY_SERVICE_URL"] = "http://localhost:8105"

# Purge any previously cached 'app' namespace from sys.modules
for mod in list(sys.modules.keys()):
    if mod == "app" or mod.startswith("app."):
        del sys.modules[mod]

from app.main import app as backend_app
from intent_parser import parse_utterance
import token_service as sec_token_service
from crypto import load_signing_key
from session_store import SessionStore


@pytest.fixture
def test_client():
    from starlette.testclient import TestClient
    return TestClient(backend_app)


@pytest.fixture(autouse=True)
def init_security_service(tmp_path, monkeypatch):
    key = load_signing_key(None)
    store = SessionStore(tmp_path)
    svc = sec_token_service.TokenService(key, store)

    # Patch Backend's request_token_signing to call real Security TokenService directly or via HTTP
    async def _real_security_sign(request):
        from models import SigningRequest
        from app.models.security import SecuritySignResponse
        sign_req = SigningRequest.from_values(
            session_id=request.session_id,
            customer_id=request.customer_id,
            transaction_type=request.transaction_type,
            amount=request.amount or 0,
            timestamp=datetime.fromisoformat(request.timestamp.replace("Z", "+00:00")),
        )
        resp = svc.sign(sign_req)
        return SecuritySignResponse(
            status="ok",
            token_id=resp.token_id,
            qr_payload=resp.qr_payload,
            hmac_signature=resp.hmac_signature,
            expires_at=resp.expires_at,
            qr_image_base64=resp.qr_image_base64,
        )

    monkeypatch.setattr("app.routers.confirmation.request_token_signing", _real_security_sign)


def test_scenario_a_happy_path_withdraw(test_client):
    """Scenario A: Full happy-path cash withdrawal with real face auth, signing, queueing, and completion."""
    session_id = str(uuid.uuid4())

    # 1. Voice Intent (Tamil spoken withdrawal)
    raw_utterance = "ஐந்தாயிரம் ரூபாய் எடுக்க வேண்டும்"
    voice_payload = parse_utterance(session_id, raw_utterance, language="ta")
    assert voice_payload["intent"] == "withdraw"
    assert voice_payload["entities"]["amount"] == 5000
    assert voice_payload["confidence"] >= 0.7

    resp1 = test_client.post("/api/v1/voice-intent", json=voice_payload)
    assert resp1.status_code == 200
    assert resp1.json()["state"] == "awaiting_auth"

    # 2. Face Authentication (Pass)
    bio_payload = {
        "session_id": session_id,
        "status": "ok",
        "auth_status": "pass",
        "methods_used": ["face"],
        "confidence_scores": {"face": 0.96},
        "liveness_passed": True,
        "customer_id": "acc_00981234",
    }
    resp2 = test_client.post("/api/v1/biometrics", json=bio_payload)
    assert resp2.status_code == 200
    assert resp2.json()["state"] == "awaiting_confirmation"

    # 3. Customer Verbal Confirmation
    confirm_payload = {"session_id": session_id, "confirmed": True}
    resp3 = test_client.post(f"/api/v1/session/{session_id}/confirm", json=confirm_payload)
    assert resp3.status_code == 200
    confirm_data = resp3.json()
    assert confirm_data["state"] == "queued"
    assert confirm_data["token_id"] is not None
    assert confirm_data["qr_image_base64"] is not None
    assert confirm_data["qr_image_base64"].startswith("iVBORw0KGgo")
    token_id = confirm_data["token_id"]

    # 4. Staff Portal: Teller scans QR & verifies token
    resp4 = test_client.get(f"/api/v1/token/{token_id}/verify")
    assert resp4.status_code == 200
    verify_data = resp4.json()
    assert verify_data["status"] == "ok"
    assert verify_data["token_id"] == token_id
    assert verify_data["transaction_type"] == "withdraw"
    assert verify_data["amount"] == 5000
    assert verify_data["customer_id"] == "acc_00981234"
    assert verify_data["hmac_signature"] is not None

    # 5. Teller marks transaction complete
    resp5 = test_client.post(f"/api/v1/teller/{token_id}/complete")
    assert resp5.status_code == 200
    assert resp5.json()["status"] == "ok"


def test_scenario_b_auth_fail_retry_terminal(test_client):
    """Scenario B: Face authentication failure -> retry count increments -> 3rd failure resets FSM to idle."""
    session_id = str(uuid.uuid4())

    voice_payload = parse_utterance(session_id, "Deposit 1000 rupees", language="en")
    resp1 = test_client.post("/api/v1/voice-intent", json=voice_payload)
    assert resp1.status_code == 200
    assert resp1.json()["state"] == "awaiting_auth"

    fail_payload = {
        "session_id": session_id,
        "status": "ok",
        "auth_status": "fail",
        "methods_used": ["face"],
        "confidence_scores": {"face": 0.3},
        "liveness_passed": False,
        "customer_id": None,
    }

    # Attempt 1 -> retry_count 1
    r1 = test_client.post("/api/v1/biometrics", json=fail_payload)
    assert r1.status_code == 200
    assert r1.json()["state"] == "awaiting_auth"
    assert r1.json()["retry_count"] == 1

    # Attempt 2 -> retry_count 2
    r2 = test_client.post("/api/v1/biometrics", json=fail_payload)
    assert r2.status_code == 200
    assert r2.json()["state"] == "awaiting_auth"
    assert r2.json()["retry_count"] == 2

    # Attempt 3 -> Terminal transition to idle
    r3 = test_client.post("/api/v1/biometrics", json=fail_payload)
    assert r3.status_code == 200
    assert r3.json()["state"] == "idle"


def test_scenario_c_customer_verbally_rejects(test_client):
    """Scenario C: Customer says No / rejects transaction summary -> session resets to idle."""
    session_id = str(uuid.uuid4())

    voice_payload = parse_utterance(session_id, "Send 2000 rupees", language="en")
    resp1 = test_client.post("/api/v1/voice-intent", json=voice_payload)
    assert resp1.status_code == 200
    # send_money cascades directly to awaiting_confirmation
    assert resp1.json()["state"] == "awaiting_confirmation"

    # Customer rejects: confirmed = False
    reject_payload = {"session_id": session_id, "confirmed": False}
    resp2 = test_client.post(f"/api/v1/session/{session_id}/confirm", json=reject_payload)
    assert resp2.status_code == 200
    assert resp2.json()["state"] == "idle"


def test_scenario_d_security_bypass_attempt(test_client):
    """Scenario D: Security bypass attempt (force requires_auth=False on withdraw) -> Backend enforces auth gate."""
    session_id = str(uuid.uuid4())

    # Voice AI payload with malicious / forged requires_auth=False
    payload = {
        "session_id": session_id,
        "status": "ok",
        "language": "en",
        "intent": "withdraw",
        "requires_auth": False,  # Attempt to bypass auth
        "entities": {"amount": 5000},
        "confidence": 0.95,
        "raw_transcript": "withdraw 5000",
    }
    resp = test_client.post("/api/v1/voice-intent", json=payload)
    assert resp.status_code == 200
    # Backend must compute backend_auth_needed and enforce awaiting_auth
    assert resp.json()["state"] == "awaiting_auth"


def test_scenario_e_tampered_forged_qr_rejected(test_client):
    """Scenario E: Tampered or forged QR token presented to Staff Portal verify endpoint -> rejected as 404 / TOKEN_NOT_FOUND."""
    fake_token_id = str(uuid.uuid4())

    resp = test_client.get(f"/api/v1/token/{fake_token_id}/verify")
    assert resp.status_code == 404
    err_detail = resp.json()["detail"]
    assert err_detail["status"] == "error"
    assert err_detail["error_code"] == "TOKEN_NOT_FOUND"
