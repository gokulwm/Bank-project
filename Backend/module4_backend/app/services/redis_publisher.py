"""
Redis Pub/Sub & In-Memory WebSocket publisher for queue lifecycle events.
All four event types (new_queue_entry, queue_called, transaction_completed,
token_expired) are published to the single kiosk:queue:events channel,
and directly to in-memory connected dashboard WebSocket clients.

FLAG 1: Channel name confirmed as kiosk:queue:events — Staff Portal must subscribe here.
"""
import json
import logging
from typing import Any, Set

import redis.asyncio as aioredis
from fastapi import WebSocket

from app.config import settings

logger = logging.getLogger(__name__)

_redis_client: aioredis.Redis | None = None  # type: ignore[type-arg]
_ws_subscribers: Set[WebSocket] = set()


def add_ws_subscriber(ws: WebSocket) -> None:
    _ws_subscribers.add(ws)


def remove_ws_subscriber(ws: WebSocket) -> None:
    _ws_subscribers.discard(ws)


async def get_redis() -> aioredis.Redis:  # type: ignore[type-arg]
    """Return the module-level Redis client, creating it on first call."""
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )
    return _redis_client


async def publish_event(event: dict) -> None:
    """Publish a queue lifecycle event dict to in-memory WebSockets and Redis channel."""
    payload = json.dumps(event)

    # 1. Direct in-memory broadcast to connected Staff Portal WebSockets
    dead_subscribers = set()
    for ws in list(_ws_subscribers):
        try:
            await ws.send_text(payload)
        except Exception:
            dead_subscribers.add(ws)
    for ws in dead_subscribers:
        _ws_subscribers.discard(ws)

    # 2. Redis Pub/Sub (if Redis server is active)
    try:
        client = await get_redis()
        await client.publish(settings.REDIS_QUEUE_CHANNEL, payload)
        logger.info(
            "Published event '%s' (token_id=%s) → channel '%s'",
            event.get("event"),
            event.get("token_id"),
            settings.REDIS_QUEUE_CHANNEL,
        )
    except Exception as exc:
        logger.debug(
            "Redis publish skipped (offline/unreachable): %s", exc
        )


async def close_redis() -> None:
    """Cleanly close the Redis connection on application shutdown."""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None
        logger.info("Redis connection closed.")
