"""Pydantic schemas for request/response validation."""

from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


# ─── Auth Schemas ─────────────────────────────────────────────
class GoogleAuthRequest(BaseModel):
    token: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    profile_picture: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    access_token: str
    user: UserResponse


# ─── Interview Schemas ────────────────────────────────────────
class StartInterviewRequest(BaseModel):
    role: str
    difficulty: str  # easy, medium, hard


class QuestionResponse(BaseModel):
    id: str
    question_text: str
    order: int

    class Config:
        from_attributes = True


class SubmitAnswerRequest(BaseModel):
    question_id: str
    answer: str


class AnswerFeedback(BaseModel):
    question_id: str
    question_text: str
    user_answer: str
    score: Optional[float] = None
    ai_feedback: Optional[str] = None
    strengths: Optional[str] = None
    weaknesses: Optional[str] = None
    improved_answer: Optional[str] = None


class InterviewResponse(BaseModel):
    id: str
    role: str
    difficulty: str
    status: str
    total_score: Optional[float] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    questions: List[QuestionResponse] = []

    class Config:
        from_attributes = True


class InterviewResultsResponse(BaseModel):
    interview: InterviewResponse
    answers: List[AnswerFeedback]
    overall_score: Optional[float] = None


class InterviewSummary(BaseModel):
    id: str
    role: str
    difficulty: str
    status: str
    total_score: Optional[float] = None
    created_at: datetime
    questions_count: int = 0

    class Config:
        from_attributes = True


# ─── Analytics Schemas ────────────────────────────────────────
class AnalyticsResponse(BaseModel):
    average_score: float = 0.0
    interviews_taken: int = 0
    total_questions_answered: int = 0
    best_score: float = 0.0
    last_interview: Optional[datetime] = None
    recent_interviews: List[InterviewSummary] = []

    class Config:
        from_attributes = True
