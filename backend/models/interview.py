"""Interview, Question, and Answer database models."""

from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid

from database.connection import Base


class Interview(Base):
    __tablename__ = "interviews"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String, nullable=False)
    difficulty = Column(String, nullable=False)  # easy, medium, hard
    status = Column(String, default="in_progress")  # in_progress, completed
    total_score = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="interviews")
    questions = relationship("Question", back_populates="interview", cascade="all, delete-orphan",
                             order_by="Question.order")


class Question(Base):
    __tablename__ = "questions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    interview_id = Column(String, ForeignKey("interviews.id"), nullable=False, index=True)
    question_text = Column(Text, nullable=False)
    order = Column(Integer, nullable=False)

    # Relationships
    interview = relationship("Interview", back_populates="questions")
    answer = relationship("Answer", back_populates="question", uselist=False, cascade="all, delete-orphan")


class Answer(Base):
    __tablename__ = "answers"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    question_id = Column(String, ForeignKey("questions.id"), nullable=False, unique=True)
    user_answer = Column(Text, nullable=False)
    ai_feedback = Column(Text, nullable=True)
    strengths = Column(Text, nullable=True)
    weaknesses = Column(Text, nullable=True)
    improved_answer = Column(Text, nullable=True)
    score = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    question = relationship("Question", back_populates="answer")
