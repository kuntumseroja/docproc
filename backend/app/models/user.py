import enum

from sqlalchemy import String, Enum, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import UUIDMixin, TimestampMixin


class UserRole(str, enum.Enum):
    SME = "sme"
    CONSUMER = "consumer"


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", values_callable=lambda e: [x.value for x in e]),
        default=UserRole.CONSUMER,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    workflows = relationship("Workflow", back_populates="created_by_user", lazy="selectin")
    documents = relationship("Document", back_populates="uploaded_by_user", lazy="selectin")
