import uuid
from typing import Optional

from sqlalchemy import String, Boolean, Text, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import UUIDMixin, TimestampMixin


class ValidationResult(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "validation_results"

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False, index=True,
    )
    rule_name: Mapped[str] = mapped_column(String(255), nullable=False)
    rule_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    details: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Relationships
    document = relationship("Document", back_populates="validation_results")
