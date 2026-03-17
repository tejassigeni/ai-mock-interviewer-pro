"""Interview API routes."""

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from database.connection import get_db
from models.interview import Interview
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
from services.ai_service import evaluate_answer, _call_llm, _extract_json
import asyncio
import json
from routes.auth import verify_access_token

router = APIRouter(prefix="/interview", tags=["Interview"])


# ─── Speech + Posture Evaluation (stateless) ─────────────────
class SpeechEvalRequest(BaseModel):
    question: str
    answer: str
    posture_description: str = ""


@router.post("/evaluate-speech")
async def evaluate_speech_answer(
    request: SpeechEvalRequest,
    user_id: str = Depends(lambda authorization=Header(...): _get_user_id(authorization)),
):
    """Evaluate a speech answer + optional posture without requiring a stored question_id."""
    if not request.question.strip() or not request.answer.strip():
        raise HTTPException(status_code=400, detail="Question and answer are required")

    try:
        # Build evaluation prompt with posture context
        posture_section = ""
        if request.posture_description.strip():
            posture_section = f"""

**Candidate's Posture/Presentation Observations:** {request.posture_description}

Also evaluate the candidate's posture and presentation. Consider:
- Are they maintaining good eye contact (looking at camera)?
- Is their posture upright and professional?
- Are they well-framed and visible?
- Is the lighting adequate?
Add these fields to your JSON response:
  "posture_score": <number from 1 to 10>,
  "posture_feedback": "<brief assessment of posture and presentation, 1-2 sentences>"
"""

        prompt = f"""You are an expert interview evaluator. Evaluate the following interview answer.

**Question:** {request.question}

**Candidate's Answer:** {request.answer}
{posture_section}
Evaluate thoroughly and return ONLY a JSON object in this exact format (no extra text):
{{
  "score": <number from 1 to 10>,
  "feedback": "<brief overall assessment, 2-3 sentences>",
  "strengths": "<what the candidate did well, 1-2 sentences>",
  "weaknesses": "<areas for improvement, 1-2 sentences>",
  "improved_answer": "<a model answer that would score 9-10, 2-4 sentences>"{', "posture_score": <number from 1 to 10>, "posture_feedback": "<posture assessment>"' if posture_section else ''}
}}"""

        text = await asyncio.to_thread(_call_llm, prompt)
        raw = _extract_json(text)
        result = json.loads(raw)

        confidence = max(1, min(10, round(float(result.get("score", 5)))))
        clarity = max(1, min(10, round(confidence + (1 if len(request.answer.split()) > 20 else -1))))
        clarity = max(1, min(10, clarity))

        response = {
            "confidence": confidence,
            "clarity": clarity,
            "feedback": result.get("feedback", "No feedback available."),
            "strengths": result.get("strengths", ""),
            "weaknesses": result.get("weaknesses", ""),
            "improved_answer": result.get("improved_answer", ""),
        }

        # Include posture feedback if available
        if "posture_score" in result:
            response["posture_score"] = max(1, min(10, round(float(result.get("posture_score", 5)))))
            response["posture_feedback"] = result.get("posture_feedback", "")

        return response
    except Exception as e:
        print(f"Speech evaluation error: {e}")
        return {
            "confidence": 5,
            "clarity": 5,
            "feedback": "Evaluation could not be completed at this time.",
            "strengths": "Answer was provided.",
            "weaknesses": "Could not be evaluated.",
            "improved_answer": "",
        }


def _get_user_id(authorization: str) -> str:
    """Extract user_id from Authorization header."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization[7:]
    return verify_access_token(token)


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
    # Get question text first (avoid lazy loading issues)
    from models.interview import Question
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
