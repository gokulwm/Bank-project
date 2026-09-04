"""
POST /api/v1/session/{session_id}/confirm
Customer verbal / UI reconfirmation step.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.models.confirmation import ConfirmationBody
from app.models.events import NewQueueEntryEvent
from app.models.security import SecuritySignRequest
from app.services.queue_manager import queue_manager
from app.services.redis_publisher import publish_event
from app.services.security_client import request_token_signing
from app.session_store import session_store

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/session/{session_id}/confirm")
async def confirm_transaction(session_id: str, body: ConfirmationBody):
    """
    Customer verbal/UI reconfirmation.
    """
    if body.session_id != session_id:
        raise HTTPException(
            status_code=400,
            detail={
                "status": "error",
                "error_code": "SESSION_ID_MISMATCH",
                "error_message": "Path session_id and body session_id do not match.",
            },
        )

    context, machine = session_store.get_or_create(session_id)

    # If in awaiting_auth and already verified, advance to awaiting_confirmation
    if machine.state == "awaiting_auth" and context.auth_status == "pass":
        machine.auth_passed()

    # If in idle, set default intent if missing and advance
    if machine.state == "idle":
        context.intent = context.intent or "withdraw"
        machine.voice_intent_received()
        if context.auth_status == "pass":
            machine.auth_passed()

    if machine.state != "awaiting_confirmation":
        raise HTTPException(
            status_code=409,
            detail={
                "status": "error",
                "error_code": "INVALID_STATE",
                "error_message": (
                    f"Session is in state '{machine.state}', "
                    "expected 'awaiting_confirmation'."
                ),
            },
        )

    # ── Customer rejected ──────────────────────────────────────────────────
    if not body.confirmed:
        machine.customer_rejected()
        logger.info("[%s] Customer rejected. FSM → idle.", session_id)
        return {"status": "ok", "state": "idle"}

    # ── Customer confirmed ─────────────────────────────────────────────────
    machine.customer_confirmed()
    logger.info(
        "[%s] Customer confirmed. FSM → confirmed. Calling Security.", session_id
    )

    # Build the signing request
    sign_request = SecuritySignRequest(
        session_id=session_id,
        customer_id=context.customer_id,
        transaction_type=context.intent or "withdraw",
        amount=context.entities.get("amount") or 5000,
        timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )

    # ── Security round-trip ────────────────────────────────────────────────
    try:
        signed = await request_token_signing(sign_request)
    except Exception as exc:
        machine.error_occurred()
        logger.error("[%s] Security service failed: %s", session_id, exc)
        raise HTTPException(
            status_code=502,
            detail={
                "status": "error",
                "error_code": "SECURITY_SERVICE_ERROR",
                "error_message": str(exc),
            },
        )

    # Store signed token data in context
    context.token_id = signed.token_id
    context.qr_payload = signed.qr_payload
    context.hmac_signature = signed.hmac_signature
    context.expires_at = signed.expires_at
    context.qr_image_base64 = signed.qr_image_base64

    # FSM → queued
    machine.token_signed()

    # Assign token number and queue position
    context.token_number = queue_manager.next_token_number()
    context.queue_position = queue_manager.current_queue_size()

    customer_display_name = f"Token {context.token_number}"

    # Publish new_queue_entry to Staff Portal via WebSocket & Redis
    event = NewQueueEntryEvent(
        token_id=signed.token_id,
        customer_display_name=customer_display_name,
        transaction_type=context.intent or "withdraw",
        amount=context.entities.get("amount") or 5000,
        queue_position=context.queue_position,
        issued_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
    await publish_event(event.model_dump())

    # Launch background expiry task
    context.expiry_task = queue_manager.launch_expiry_task(
        session_id=session_id,
        token_id=signed.token_id,
        expires_at=signed.expires_at,
    )

    logger.info(
        "[%s] Queued. token_id=%s token_number=%d position=%d expires_at=%s",
        session_id,
        signed.token_id,
        context.token_number,
        context.queue_position,
        signed.expires_at,
    )

    return {
        "status": "ok",
        "state": machine.state,
        "token_id": signed.token_id,
        "token_number": context.token_number,
        "queue_position": context.queue_position,
        "qr_payload": signed.qr_payload,
        "qr_image_base64": signed.qr_image_base64,
        "expires_at": signed.expires_at,
    }
