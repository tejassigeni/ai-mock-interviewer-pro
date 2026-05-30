"""User database model."""

from sqlalchemy import Column, String, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid

from database.connection import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    profile_picture = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    interviews = relationship("Interview", back_populates="user", cascade="all, delete-orphan")
    analytics = relationship("Analytics", back_populates="user", uselist=False, cascade="all, delete-orphan")
