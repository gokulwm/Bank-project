import base64
import json
import os
import secrets
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
import sys
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ["SECURITY_SVC_DEV_MODE"] = "1"
os.environ["SECURITY_SVC_KEY_B64"] = base64.b64encode(secrets.token_bytes(32)).decode()

from crypto import load_signing_key, verify_hmac_sha256
from models import SigningRequest
from qr_generator import generate_qr_for_payload
from session_store import SessionStore
from token_service import TokenService
from validation import validate_request


@pytest.fixture
def token_service(tmp_path):
    key = load_signing_key(None)
    store = SessionStore(tmp_path)
    return TokenService(key, store)


def test_sign_with_valid_request(token_service):
    raw_req = {
        "session_id": "12345678-1234-5678-1234-567812345678",
        "customer_id": "acc_00981234",
        "transaction_type": "withdraw",
        "amount": 5000,
        "timestamp": "2026-08-21T10:15:30Z",
    }
    req = validate_request(raw_req)
    resp = token_service.sign(req)
    assert resp.status == "ok"
    assert resp.token_id is not None
    assert resp.hmac_signature is not None
    assert resp.qr_image_base64 is not None
    assert resp.qr_image_base64.startswith("iVBORw0KGgo")  # PNG magic header in base64


def test_sign_with_null_customer_id(token_service):
    raw_req = {
        "session_id": "12345678-1234-5678-1234-567812345678",
        "customer_id": None,
        "transaction_type": "send_money",
        "amount": 2000,
        "timestamp": "2026-08-21T10:15:30Z",
    }
    req = validate_request(raw_req)
    resp = token_service.sign(req)
    assert resp.status == "ok"
    assert resp.token_id is not None
    assert resp.qr_image_base64 is not None


def test_qr_image_generator():
    path, b64_img = generate_qr_for_payload("test-token-id-12345")
    assert b64_img is not None
    img_bytes = base64.b64decode(b64_img)
    assert img_bytes[:8] == b"\x89PNG\r\n\x1a\n"
