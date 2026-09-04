"""
WS /ws/dashboard
Real-time WebSocket push to the Staff Portal & Hardware dashboards (module 6).
Forwards all four queue lifecycle event types verbatim to every connected dashboard client.
Uses in-memory broadcasting with fallback to Redis Pub/Sub if active.

FLAG 1: Channel name is kiosk:queue:events — Staff Portal must subscribe here.
"""
import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings
from app.services.redis_publisher import add_ws_subscriber, get_redis, remove_ws_subscriber

router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/ws/dashboard")
async def dashboard_websocket(websocket: WebSocket) -> None:
    """
    Staff Portal subscribes here. One WebSocket connection receives all four
    event types: new_queue_entry, queue_called, transaction_completed, token_expired.
    """
    await websocket.accept()
    add_ws_subscriber(websocket)
    logger.info("Staff Portal connected to /ws/dashboard")

    # Optional Redis Pub/Sub forwarding
    redis_task = None
    pubsub = None
    try:
        redis_client = await get_redis()
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(settings.REDIS_QUEUE_CHANNEL)

        async def forward_redis_to_ws() -> None:
            try:
                async for message in pubsub.listen():
                    if message["type"] == "message":
                        await websocket.send_text(message["data"])
            except Exception:
                pass

        redis_task = asyncio.create_task(forward_redis_to_ws())
    except Exception as exc:
        logger.debug("Redis pubsub listener inactive (in-memory websocket used): %s", exc)

    try:
        # Keep connection open and drain incoming ping messages
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("Staff Portal disconnected from /ws/dashboard cleanly.")
    except Exception as exc:
        logger.warning("Staff Portal WebSocket error: %s", exc)
    finally:
        remove_ws_subscriber(websocket)
        if redis_task:
            redis_task.cancel()
        if pubsub:
            try:
                await pubsub.unsubscribe(settings.REDIS_QUEUE_CHANNEL)
                await pubsub.aclose()
            except Exception:
                pass
