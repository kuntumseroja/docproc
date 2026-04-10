import uuid
from typing import Optional

from sqlalchemy import String, Float, Text, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import UUIDMixin, TimestampMixin


class Extraction(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "extractions"

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False, index=True,
    )
    field_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    field_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    field_type: Mapped[str] = mapped_column(String(50), default="string", nullable=False)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    source_location: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    corrected_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    model_used: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Relationships
    document = relationship("Document", back_populates="extractions")
