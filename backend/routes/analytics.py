"""Analytics API routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database.connection import get_db
from models.analytics import Analytics
from models.interview import Interview
from schemas.schemas import AnalyticsResponse, InterviewSummary
from routes.auth import verify_access_token
from routes.interview import get_current_user_id

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("", response_model=AnalyticsResponse)
async def get_analytics(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get user's analytics and progress data."""
    # Get analytics record
    result = await db.execute(select(Analytics).where(Analytics.user_id == user_id))
    analytics = result.scalar_one_or_none()

    # Get recent interviews
    result = await db.execute(
        select(Interview)
        .options(selectinload(Interview.questions))
        .where(Interview.user_id == user_id)
        .order_by(Interview.created_at.desc())
        .limit(5)
    )
    recent = result.scalars().all()

    recent_interviews = [
        InterviewSummary(
            id=i.id,
            role=i.role,
            difficulty=i.difficulty,
            status=i.status,
            total_score=i.total_score,
            created_at=i.created_at,
            questions_count=len(i.questions),
        )
        for i in recent
    ]

    if analytics:
        return AnalyticsResponse(
            average_score=analytics.average_score,
            interviews_taken=analytics.interviews_taken,
            total_questions_answered=analytics.total_questions_answered,
            best_score=analytics.best_score,
            last_interview=analytics.last_interview,
            recent_interviews=recent_interviews,
        )

    return AnalyticsResponse(recent_interviews=recent_interviews)
