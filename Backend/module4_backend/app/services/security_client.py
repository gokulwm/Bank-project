"""
HTTP client for the Security module.
Backend sends a signing request and receives a signed QR token in return.
"""
import logging
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.models.security import SecuritySignRequest, SecuritySignResponse

logger = logging.getLogger(__name__)


async def request_token_signing(request: SecuritySignRequest) -> SecuritySignResponse:
    """
    POST to the Security module's /sign endpoint.
    """
    logger.info(
        "Requesting token signing from Security. session_id=%s transaction_type=%s amount=%s",
        request.session_id,
        request.transaction_type,
        request.amount,
    )

    urls = [
        f"{settings.SECURITY_SERVICE_URL}/sign",
        "http://127.0.0.1:8105/sign",
        "http://localhost:8105/sign",
    ]

    last_exc = None
    data = None

    async with httpx.AsyncClient(timeout=8.0) as client:
        for url in urls:
            try:
                response = await client.post(url, json=request.model_dump())
                response.raise_for_status()
                data = response.json()
                if data and data.get("status") == "ok":
                    break
            except Exception as exc:
                last_exc = exc
                logger.debug("Failed connecting to Security at %s: %s", url, exc)

    if not data or data.get("status") != "ok":
        raise ValueError(
            f"Security service unreachable: {last_exc or 'Invalid response'}"
        )

    signed = SecuritySignResponse(**data)
    logger.info(
        "Token signed. token_id=%s expires_at=%s",
        signed.token_id,
        signed.expires_at,
    )
    return signed
