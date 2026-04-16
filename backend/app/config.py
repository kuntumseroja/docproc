import os
from pathlib import Path

from pydantic_settings import BaseSettings
from typing import List, Optional

# Resolve .env from project root (one level up from backend/)
# In Docker, env vars are injected directly so .env file is optional
_env_file = Path(__file__).resolve().parents[2] / ".env"
if not _env_file.exists():
    _env_file = Path(".env")
if not _env_file.exists():
    _env_file = None  # type: ignore


class Settings(BaseSettings):
    APP_NAME: str = "DocProc API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://docproc:docproc@localhost:5433/docproc"

    # Redis
    REDIS_URL: str = "redis://localhost:6380/0"

    # MinIO / S3
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "docproc"
    MINIO_USE_SSL: bool = False

    # JWT
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # OCR
    OCR_PROVIDER: str = "tesseract"  # tesseract | mistral
    TESSERACT_PATH: str = "tesseract"

    # LLM Provider
    LLM_PROVIDER: str = "anthropic"
    LLM_MODEL: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    MISTRAL_API_KEY: Optional[str] = None
    OLLAMA_BASE_URL: str = "http://localhost:11434"

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    model_config = {
        "env_file": str(_env_file) if _env_file else None,
        "env_file_encoding": "utf-8",
    }


settings = Settings()
