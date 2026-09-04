"""
POST /api/v1/biometrics
Receives the biometrics auth result from the Biometrics module.
"""
import logging

from fastapi import APIRouter, HTTPException

from app.models.biometrics import BiometricsPayload
from app.session_store import session_store

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/biometrics")
async def receive_biometrics(payload: BiometricsPayload):
    """
    Called by the Biometrics module after face auth resolves.
    Supports receiving biometrics both before and after voice intent.
    """
    if payload.status != "ok":
        raise HTTPException(
            status_code=400,
            detail={
                "status": "error",
                "error_code": payload.error_code or "BIOMETRICS_ERROR",
                "error_message": payload.error_message or "Biometrics reported an error.",
            },
        )

    context, machine = session_store.get_or_create(payload.session_id)

    # Store biometrics data in session context
    context.auth_status = payload.auth_status
    context.methods_used = payload.methods_used
    context.confidence_scores = payload.confidence_scores
    context.liveness_passed = payload.liveness_passed
    context.customer_id = payload.customer_id

    # If session is still idle (face verified before voice input), store and return ok
    if machine.state == "idle":
        logger.info(
            "[%s] Early Biometrics stored in idle state. customer_id=%s auth_status=%s",
            payload.session_id,
            payload.customer_id,
            payload.auth_status,
        )
        return {
            "status": "ok",
            "session_id": payload.session_id,
            "state": "idle",
            "auth_status": payload.auth_status,
            "customer_id": payload.customer_id,
        }

    # If session is in awaiting_auth
    if machine.state == "awaiting_auth":
        if payload.auth_status == "pass":
            machine.auth_passed()
            logger.info(
                "[%s] Auth passed. customer_id=%s methods=%s → state='%s'",
                payload.session_id,
                payload.customer_id,
                payload.methods_used,
                machine.state,
            )
            return {
                "status": "ok",
                "session_id": payload.session_id,
                "state": machine.state,   # awaiting_confirmation
            }

        # Auth failed
        if context.can_retry_auth():
            machine.auth_failed_retry()
            logger.warning(
                "[%s] Auth failed. retry_count=%d. Prompting retry.",
                payload.session_id,
                context.retry_count,
            )
            return {
                "status": "ok",
                "session_id": payload.session_id,
                "state": machine.state,   # awaiting_auth (retry)
                "retry_count": context.retry_count,
                "action": "retry_auth",
            }
        else:
            machine.auth_failed_terminal()
            logger.error(
                "[%s] Auth failed terminally after %d retries. FSM → idle.",
                payload.session_id,
                context.retry_count,
            )
            return {
                "status": "ok",
                "session_id": payload.session_id,
                "state": machine.state,   # idle
                "action": "session_ended",
                "message": "Maximum authentication retries exceeded. Session has been reset.",
            }

    # Already awaiting confirmation
    return {
        "status": "ok",
        "session_id": payload.session_id,
        "state": machine.state,
    }
