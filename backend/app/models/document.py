import enum
import uuid
from typing import Optional

from sqlalchemy import String, Enum, Text, Integer, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from app.db.base import Base
from app.models.base import UUIDMixin, TimestampMixin


class DocumentStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    EXTRACTED = "extracted"
    VALIDATED = "validated"
    COMPLETED = "completed"
    FAILED = "failed"


class Document(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "documents"

    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="document_status", values_callable=lambda e: [x.value for x in e]),
        default=DocumentStatus.UPLOADED,
        nullable=False,
        index=True,
    )
    ocr_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    page_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    embedding = mapped_column(Vector(1536), nullable=True)

    workflow_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflows.id"), nullable=True, index=True,
    )
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True,
    )

    # Relationships
    workflow = relationship("Workflow", back_populates="documents")
    uploaded_by_user = relationship("User", back_populates="documents")
    extractions = relationship("Extraction", back_populates="document", lazy="selectin")
    validation_results = relationship("ValidationResult", back_populates="document", lazy="selectin")
    action_logs = relationship("ActionLog", back_populates="document", lazy="selectin")
