import enum
import uuid
from typing import Optional

from sqlalchemy import String, Enum, Text, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import UUIDMixin, TimestampMixin


class WorkflowStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class Workflow(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "workflows"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[WorkflowStatus] = mapped_column(
        Enum(WorkflowStatus, name="workflow_status", values_callable=lambda e: [x.value for x in e]),
        default=WorkflowStatus.DRAFT,
        nullable=False,
        index=True,
    )
    document_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    extraction_schema: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    validation_rules: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    action_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True,
    )

    # Relationships
    created_by_user = relationship("User", back_populates="workflows")
    documents = relationship("Document", back_populates="workflow", lazy="selectin")
