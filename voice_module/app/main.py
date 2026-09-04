"""
FastAPI Server for Voice AI Module (Module 2).
Exposes REST and WebSocket endpoints for audio transcription, intent parsing,
and bridge calls to Backend (Module 4).
Runs on port 8200 by default.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

# Ensure parent module dir is in sys.path for intent_parser / stt_pipeline
MODULE_ROOT = str(Path(__file__).resolve().parent.parent)
if MODULE_ROOT not in sys.path:
    sys.path.insert(0, MODULE_ROOT)

import httpx
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from intent_parser import CONFIDENCE_THRESHOLD, normalize_text, parse_utterance
from stt_pipeline import stt_pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice_module")

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")

app = FastAPI(title="Vernacular Voice AI Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ParseIntentRequest(BaseModel):
    session_id: str
    raw_transcript: str
    language: str = "ta"
    forward_to_backend: bool = True
    forced_confidence: Optional[float] = None


class ConfirmRequest(BaseModel):
    session_id: str
    confirmed: Optional[bool] = None
    spoken_confirmation: Optional[str] = None


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "service": "voice_module", "confidence_threshold": str(CONFIDENCE_THRESHOLD)}


@app.post("/api/v1/parse-intent")
async def parse_and_forward_intent(req: ParseIntentRequest) -> Dict[str, Any]:
    """
    Parse customer utterance into fixed Backend contract JSON.
    Optionally forwards directly to Backend /api/v1/voice-intent.
    """
    payload = parse_utterance(
        session_id=req.session_id,
        raw_transcript=req.raw_transcript,
        language=req.language,
        forced_confidence=req.forced_confidence,
    )

    result = {"intent_payload": payload}

    if req.forward_to_backend:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                backend_resp = await client.post(
                    f"{BACKEND_URL}/api/v1/voice-intent",
                    json=payload,
                )
                result["backend_status_code"] = backend_resp.status_code
                result["backend_response"] = backend_resp.json()
        except Exception as exc:
            logger.warning(f"Backend forwarding failed: {exc}")
            result["backend_error"] = str(exc)

    return result


@app.post("/api/v1/confirm")
async def confirm_transaction(req: ConfirmRequest) -> Dict[str, Any]:
    """
    Parse spoken confirmation or take boolean flag, then call Backend confirmation endpoint.
    """
    is_confirmed = req.confirmed
    if is_confirmed is None and req.spoken_confirmation:
        norm = normalize_text(req.spoken_confirmation)
        if any(w in norm for w in ["yes", "confirm", "continue", "ஆம்", "சரி", "உறுதி"]):
            is_confirmed = True
        elif any(w in norm for w in ["no", "cancel", "stop", "இல்லை", "ரத்து"]):
            is_confirmed = False
        else:
            is_confirmed = False

    confirm_payload = {
        "session_id": req.session_id,
        "confirmed": bool(is_confirmed),
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            backend_resp = await client.post(
                f"{BACKEND_URL}/api/v1/session/{req.session_id}/confirm",
                json=confirm_payload,
            )
            return {
                "status": "ok",
                "backend_status_code": backend_resp.status_code,
                "backend_response": backend_resp.json(),
            }
    except Exception as exc:
        logger.error(f"Backend confirmation failed: {exc}")
        raise HTTPException(status_code=502, detail=f"Backend connection error: {exc}")


@app.websocket("/ws/voice")
async def websocket_voice_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for streaming audio/metadata from Frontend.
    Contract sends: { session_id, spoken_text, language }
    """
    await websocket.accept()
    session_id = None
    language = "ta"
    try:
        while True:
            msg = await websocket.receive_text()
            data = json.loads(msg)

            # Initial handshake metadata
            if "preferred_language" in data:
                session_id = data.get("session_id")
                language = data.get("preferred_language", "ta")
                await websocket.send_json({"status": "ok", "message": "session_initialized"})
                continue

            # Spoken transcript / audio chunk
            raw_text = data.get("transcript") or data.get("spoken_text") or ""
            if raw_text:
                parsed = parse_utterance(
                    session_id=session_id or data.get("session_id", "default-session"),
                    raw_transcript=raw_text,
                    language=language,
                )
                
                # Build contract response
                response_caption = {
                    "session_id": parsed["session_id"],
                    "spoken_text": f"Parsed request: {parsed['intent']} {parsed['entities'].get('amount') or ''}".strip(),
                    "language": language,
                    "intent": parsed["intent"],
                    "entities": parsed["entities"],
                    "confidence": parsed["confidence"],
                }
                await websocket.send_json(response_caption)
    except WebSocketDisconnect:
        logger.info("Voice WebSocket disconnected.")
    except Exception as exc:
        logger.error(f"Voice WebSocket error: {exc}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8200)
