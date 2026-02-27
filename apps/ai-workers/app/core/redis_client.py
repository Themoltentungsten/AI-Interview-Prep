import redis
from app.core.config import settings

client = redis.Redis(
    host=settings.VALKEY_HOST,
    port=settings.VALKEY_PORT,
    decode_responses=True
)

