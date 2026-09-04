"""
POST /api/v1/voice-intent
Receives a parsed intent from Voice AI, validates it, populates the session
context, fires the FSM, and returns the already-advanced state.
"""
import logging

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.models.voice_intent import VoiceIntentPayload
from app.services.auth_gate import check_requires_auth_mismatch, compute_backend_auth_needed
from app.session_store import session_store

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/voice-intent")
async def receive_voice_intent(payload: VoiceIntentPayload):
    """
    Entry point for every customer session.
    Called once by Voice AI after it has fully parsed an utterance into intent + entities.
    """
    if payload.status != "ok":
        raise HTTPException(
            status_code=400,
            detail={
                "status": "error",
                "error_code": payload.error_code or "VOICE_AI_ERROR",
                "error_message": payload.error_message or "Voice AI reported an error.",
            },
        )

    context, machine = session_store.get_or_create(payload.session_id)

    # If session is in awaiting_auth or idle, we can accept/update intent
    if machine.state not in ("idle", "awaiting_auth", "awaiting_confirmation"):
        raise HTTPException(
            status_code=409,
            detail={
                "status": "error",
                "error_code": "SESSION_NOT_IDLE",
                "error_message": (
                    f"Session '{payload.session_id}' is in state '{machine.state}'. "
                    "Cannot accept a new intent until the session resets to idle."
                ),
            },
        )

    # Populate context with Voice AI data
    context.intent = payload.intent
    context.language = payload.language
    context.entities = payload.entities
    context.confidence = payload.confidence
    context.raw_transcript = payload.raw_transcript
    context.requires_auth_from_voice_ai = payload.requires_auth

    # ── Auth gate (security-critical) ──────────────────────────────────────
    context.backend_auth_needed = compute_backend_auth_needed(payload.intent)
    check_requires_auth_mismatch(payload.intent, payload.requires_auth)

    # ── Confidence gate ────────────────────────────────────────────────────
    if payload.confidence < settings.CONFIDENCE_THRESHOLD:
        if machine.state == "idle":
            machine.low_confidence()
        logger.info(
            "[%s] Low confidence %.2f < %.2f. Signalling re-prompt.",
            payload.session_id,
            payload.confidence,
            settings.CONFIDENCE_THRESHOLD,
        )
        return {
            "status": "ok",
            "session_id": payload.session_id,
            "state": machine.state,
            "action": "re_prompt",
            "message": (
                f"Confidence {payload.confidence:.2f} is below threshold "
                f"{settings.CONFIDENCE_THRESHOLD}. Please re-prompt the customer."
            ),
        }

    # ── Fire FSM ────────────────────────────────────────────────────────────
    if machine.state == "idle":
        machine.voice_intent_received()

    # If customer was already verified in kiosk flow, auto-advance to awaiting_confirmation
    if machine.state == "awaiting_auth" and context.auth_status == "pass":
        machine.auth_passed()
        logger.info(
            "[%s] Pre-authenticated customer %s auto-advanced to awaiting_confirmation",
            payload.session_id,
            context.customer_id,
        )

    logger.info(
        "[%s] Voice intent accepted. intent='%s' backend_auth_needed=%s → state='%s'",
        payload.session_id,
        payload.intent,
        context.backend_auth_needed,
        machine.state,
    )

    return {
        "status": "ok",
        "session_id": payload.session_id,
        "state": machine.state,   # awaiting_auth or awaiting_confirmation
    }
