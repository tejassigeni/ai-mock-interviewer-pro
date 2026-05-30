"""Interview API routes."""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional

from database.connection import get_db, async_session
from models.interview import Interview, Question, Answer
from models.analytics import Analytics
from schemas.schemas import (
    StartInterviewRequest,
    InterviewResponse,
    QuestionResponse,
    SubmitAnswerRequest,
    AnswerFeedback,
    InterviewResultsResponse,
    AnalyticsResponse,
    InterviewSummary,
)
from services.interview_service import (
    create_interview,
    get_interview,
    submit_answer,
    get_interview_results,
)
from services.ai_service import evaluate_speech, evaluate_posture, evaluate_answer_stream
from routes.auth import verify_access_token

router = APIRouter(prefix="/interview", tags=["Interview"])


# ─── Request/Response schemas for speech & posture ────────────
class SpeechEvalRequest(BaseModel):
    question: str
    answer: str


class SpeechEvalResponse(BaseModel):
    speech_score: float
    clarity: str
    structure: str
    confidence: str
    filler_words: str
    tips: str


class PostureEvalRequest(BaseModel):
    question: str
    answer: str
    camera_was_on: bool = True


class PostureEvalResponse(BaseModel):
    posture_score: float
    eye_contact: str
    body_language: str
    expression: str
    presentation_tips: str


async def get_current_user_id(authorization: str = Header(...)) -> str:
    """Extract user_id from Authorization header."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization[7:]
    return verify_access_token(token)


@router.post("/start", response_model=InterviewResponse)
async def start_interview(
    request: StartInterviewRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Start a new interview session."""
    interview = await create_interview(db, user_id, request.role, request.difficulty)
    return InterviewResponse(
        id=interview.id,
        role=interview.role,
        difficulty=interview.difficulty,
        status=interview.status,
        total_score=interview.total_score,
        created_at=interview.created_at,
        completed_at=interview.completed_at,
        questions=[
            QuestionResponse(id=q.id, question_text=q.question_text, order=q.order)
            for q in interview.questions
        ],
    )


@router.get("/{interview_id}/questions", response_model=list[QuestionResponse])
async def get_questions(
    interview_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get questions for an interview."""
    interview = await get_interview(db, interview_id)
    if not interview or interview.user_id != user_id:
        raise HTTPException(status_code=404, detail="Interview not found")
    return [
        QuestionResponse(id=q.id, question_text=q.question_text, order=q.order)
        for q in interview.questions
    ]


@router.post("/answer", response_model=AnswerFeedback)
async def submit_interview_answer(
    request: SubmitAnswerRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Submit an answer and get AI evaluation."""
    q_result = await db.execute(select(Question).where(Question.id == request.question_id))
    question = q_result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    try:
        answer = await submit_answer(db, request.question_id, request.answer)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return AnswerFeedback(
        question_id=request.question_id,
        question_text=question.question_text,
        user_answer=answer.user_answer,
        score=answer.score,
        ai_feedback=answer.ai_feedback,
        strengths=answer.strengths,
        weaknesses=answer.weaknesses,
        improved_answer=answer.improved_answer,
    )


@router.post("/answer/stream")
async def submit_interview_answer_stream(
    request: SubmitAnswerRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Submit an answer and stream AI evaluation via SSE.
    
    Returns Server-Sent Events:
    - data: {"chunk": "...", "done": false}  — raw token chunks as they arrive
    - data: {"result": {...}, "done": true}   — final structured evaluation
    
    NOTE: Uses its own DB session to avoid the FastAPI dependency lifecycle issue
    where StreamingResponse generators run after the dependency scope closes.
    """
    # Pre-validate with a short-lived session before streaming
    async with async_session() as db:
        q_result = await db.execute(select(Question).where(Question.id == request.question_id))
        question = q_result.scalar_one_or_none()
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")

        existing_result = await db.execute(select(Answer).where(Answer.question_id == request.question_id))
        if existing_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Question already answered")

        # Capture values needed for the generator
        question_text = question.question_text
        question_interview_id = question.interview_id

    async def event_generator():
        """Stream evaluation tokens then save to DB with its own session."""
        final_result = None
        async for event in evaluate_answer_stream(question_text, request.answer):
            yield event
            # Parse the done event to get final result for DB save
            if '"done": true' in event or '"done":true' in event:
                try:
                    payload = json.loads(event.replace("data: ", "").strip())
                    final_result = payload.get("result")
                except Exception:
                    pass

        # Save to DB with a dedicated session (not the FastAPI dependency one)
        if final_result:
            async with async_session() as db:
                try:
                    answer_obj = Answer(
                        question_id=request.question_id,
                        user_answer=request.answer,
                        ai_feedback=final_result.get("feedback", ""),
                        strengths=final_result.get("strengths", ""),
                        weaknesses=final_result.get("weaknesses", ""),
                        improved_answer=final_result.get("improved_answer", ""),
                        score=final_result.get("score", 5.0),
                    )
                    db.add(answer_obj)
                    await db.flush()

                    # Check completion and update analytics
                    interview_result = await db.execute(
                        select(Interview)
                        .options(selectinload(Interview.questions).selectinload(Question.answer))
                        .where(Interview.id == question_interview_id)
                    )
                    interview_obj = interview_result.scalar_one_or_none()
                    if interview_obj:
                        all_answered = all(q.answer is not None for q in interview_obj.questions)
                        if all_answered:
                            scores = [q.answer.score for q in interview_obj.questions if q.answer and q.answer.score]
                            interview_obj.total_score = sum(scores) / len(scores) if scores else 0
                            interview_obj.status = "completed"
                            interview_obj.completed_at = datetime.now(timezone.utc)

                    await db.commit()
                    print(f"[Stream] Answer saved and committed for question {request.question_id}")
                except Exception as e:
                    await db.rollback()
                    print(f"[Stream] DB save failed: {e}")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/{interview_id}/results", response_model=InterviewResultsResponse)
async def get_results(
    interview_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get full results for a completed interview."""
    results = await get_interview_results(db, interview_id)
    if not results or results["interview"].user_id != user_id:
        raise HTTPException(status_code=404, detail="Interview not found")

    interview = results["interview"]
    return InterviewResultsResponse(
        interview=InterviewResponse(
            id=interview.id,
            role=interview.role,
            difficulty=interview.difficulty,
            status=interview.status,
            total_score=interview.total_score,
            created_at=interview.created_at,
            completed_at=interview.completed_at,
            questions=[
                QuestionResponse(id=q.id, question_text=q.question_text, order=q.order)
                for q in interview.questions
            ],
        ),
        answers=[AnswerFeedback(**a) for a in results["answers"]],
        overall_score=results["overall_score"],
    )


@router.get("s/history", response_model=list[InterviewSummary])
async def get_interview_history(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get user's interview history."""
    result = await db.execute(
        select(Interview)
        .options(selectinload(Interview.questions))
        .where(Interview.user_id == user_id)
        .order_by(Interview.created_at.desc())
        .limit(20)
    )
    interviews = result.scalars().all()
    return [
        InterviewSummary(
            id=i.id,
            role=i.role,
            difficulty=i.difficulty,
            status=i.status,
            total_score=i.total_score,
            created_at=i.created_at,
            questions_count=len(i.questions),
        )
        for i in interviews
    ]


@router.post("/evaluate-speech", response_model=SpeechEvalResponse)
async def evaluate_speech_endpoint(request: SpeechEvalRequest):
    """Evaluate a spoken answer's delivery quality."""
    try:
        result = await evaluate_speech(request.question, request.answer)
        return SpeechEvalResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech evaluation failed: {str(e)}")


@router.post("/evaluate-posture", response_model=PostureEvalResponse)
async def evaluate_posture_endpoint(request: PostureEvalRequest):
    """Get camera/presentation coaching tips based on the interview context."""
    try:
        result = await evaluate_posture(request.question, request.answer, request.camera_was_on)
        return PostureEvalResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Posture evaluation failed: {str(e)}")
