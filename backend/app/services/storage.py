from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class StorageBackend(ABC):
    """Abstract storage backend."""

    @abstractmethod
    def upload(self, local_path: Path, remote_path: str) -> str:
        pass

    @abstractmethod
    def download(self, remote_path: str, local_path: Path) -> Path:
        pass

    @abstractmethod
    def delete(self, remote_path: str) -> bool:
        pass


class MinIOStorage(StorageBackend):
    """MinIO storage backend."""

    def __init__(self, endpoint: str, bucket: str, access_key: str, secret_key: str, secure: bool = False):
        self.endpoint = endpoint
        self.bucket = bucket
        try:
            from minio import Minio
            self.client = Minio(
                endpoint,
                access_key=access_key,
                secret_key=secret_key,
                secure=secure,
            )
            # Ensure bucket exists
            if not self.client.bucket_exists(bucket):
                self.client.make_bucket(bucket)
        except Exception as e:
            logger.error(f"Failed to initialize MinIO client: {e}")
            self.client = None

    def upload(self, local_path: Path, remote_path: str) -> str:
        try:
            self.client.fput_object(self.bucket, remote_path, str(local_path))
            return f"minio://{self.endpoint}/{self.bucket}/{remote_path}"
        except Exception as e:
            logger.error(f"MinIO upload failed: {e}")
            raise

    def upload_bytes(self, data: bytes, remote_path: str, content_type: str = "application/octet-stream") -> str:
        import io
        try:
            self.client.put_object(
                self.bucket, remote_path,
                io.BytesIO(data), len(data),
                content_type=content_type,
            )
            return f"minio://{self.endpoint}/{self.bucket}/{remote_path}"
        except Exception as e:
            logger.error(f"MinIO upload_bytes failed: {e}")
            raise

    def download(self, remote_path: str, local_path: Path) -> Path:
        try:
            self.client.fget_object(self.bucket, remote_path, str(local_path))
            return local_path
        except Exception as e:
            logger.error(f"MinIO download failed: {e}")
            raise

    def delete(self, remote_path: str) -> bool:
        try:
            self.client.remove_object(self.bucket, remote_path)
            return True
        except Exception as e:
            logger.error(f"MinIO delete failed: {e}")
            return False


def get_storage() -> MinIOStorage:
    """Create storage backend from settings."""
    from app.config import settings
    return MinIOStorage(
        endpoint=settings.MINIO_ENDPOINT,
        bucket=settings.MINIO_BUCKET,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_USE_SSL,
    )
