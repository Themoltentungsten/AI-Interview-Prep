from app.core.config import settings
from mem0 import Memory
config = {
    "version":"v1.1",

    "llm": {
        "provider": "openai",
        "config": {
            "api_key": settings.OPENAI_API_KEY,
            "model": "gpt-4.1"
        }
    },

    "vector_store": {
        "provider": "qdrant",
        "config": {
            "url": settings.QDRANT_URI,
            "collection_name": "mem0_vectors"
        }
    },
}
memory_client = Memory.from_config(config)