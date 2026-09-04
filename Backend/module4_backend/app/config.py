from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Redis
    REDIS_URL: str = "redis://127.0.0.1:6379"
    REDIS_QUEUE_CHANNEL: str = "kiosk:queue:events"

    # Security module — real module runs on 8105
    SECURITY_SERVICE_URL: str = "http://127.0.0.1:8105"

    # FSM thresholds
    CONFIDENCE_THRESHOLD: float = 0.7
    MAX_AUTH_RETRIES: int = 2

    # Fallback token TTL if Security does not return expires_at
    TOKEN_EXPIRY_MINUTES: int = 10

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
