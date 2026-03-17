"""Interview service — orchestrates interview flow."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from typing import Optional

from models.interview import Interview, Question, Answer
from models.analytics import Analytics
from services.ai_service import generate_questions, evaluate_answer


async def create_interview(db: AsyncSession, user_id: str, role: str, difficulty: str) -> Interview:
    """Create a new interview and generate AI questions."""
    # Create interview record
    interview = Interview(user_id=user_id, role=role, difficulty=difficulty)
    db.add(interview)
    await db.flush()

    # Generate questions via AI
    ai_questions = await generate_questions(role, difficulty)

    for q_data in ai_questions:
        question = Question(
            interview_id=interview.id,
            question_text=q_data["question"],
            order=q_data["order"]
        )
        db.add(question)

    await db.flush()

    # Reload with questions
    result = await db.execute(
        select(Interview)
        .options(selectinload(Interview.questions))
        .where(Interview.id == interview.id)
    )
    return result.scalar_one()


async def get_interview(db: AsyncSession, interview_id: str) -> Optional[Interview]:
    """Get interview with questions loaded."""
    result = await db.execute(
        select(Interview)
        .options(selectinload(Interview.questions).selectinload(Question.answer))
        .where(Interview.id == interview_id)
    )
    return result.scalar_one_or_none()


async def submit_answer(db: AsyncSession, question_id: str, user_answer: str) -> Answer:
    """Submit and evaluate an answer for a question."""
    # Get the question
    result = await db.execute(select(Question).where(Question.id == question_id))
    question = result.scalar_one_or_none()
    if not question:
        raise ValueError("Question not found")

    # Check if already answered
    result = await db.execute(select(Answer).where(Answer.question_id == question_id))
    existing = result.scalar_one_or_none()
    if existing:
        raise ValueError("Question already answered")

    # Evaluate with AI
    evaluation = await evaluate_answer(question.question_text, user_answer)

    # Store answer + feedback
    answer = Answer(
        question_id=question_id,
        user_answer=user_answer,
        ai_feedback=evaluation.get("feedback", ""),
        strengths=evaluation.get("strengths", ""),
        weaknesses=evaluation.get("weaknesses", ""),
        improved_answer=evaluation.get("improved_answer", ""),
        score=evaluation.get("score", 5.0),
    )
    db.add(answer)
    await db.flush()

    # Check if all questions answered → complete interview
    interview_result = await db.execute(
        select(Interview)
        .options(selectinload(Interview.questions).selectinload(Question.answer))
        .where(Interview.id == question.interview_id)
    )
    interview = interview_result.scalar_one()

    all_answered = all(q.answer is not None for q in interview.questions)
    if all_answered:
        scores = [q.answer.score for q in interview.questions if q.answer and q.answer.score]
        interview.total_score = sum(scores) / len(scores) if scores else 0
        interview.status = "completed"
        interview.completed_at = datetime.now(timezone.utc)
        await _update_analytics(db, interview.user_id, interview.total_score)

    return answer


async def get_interview_results(db: AsyncSession, interview_id: str) -> dict:
    """Get full interview results with all answers and scores."""
    interview = await get_interview(db, interview_id)
    if not interview:
        return None

    answers = []
    for q in interview.questions:
        answer_data = {
            "question_id": q.id,
            "question_text": q.question_text,
            "user_answer": q.answer.user_answer if q.answer else "",
            "score": q.answer.score if q.answer else None,
            "ai_feedback": q.answer.ai_feedback if q.answer else None,
            "strengths": q.answer.strengths if q.answer else None,
            "weaknesses": q.answer.weaknesses if q.answer else None,
            "improved_answer": q.answer.improved_answer if q.answer else None,
        }
        answers.append(answer_data)

    scores = [a["score"] for a in answers if a["score"] is not None]
    overall = sum(scores) / len(scores) if scores else None

    return {
        "interview": interview,
        "answers": answers,
        "overall_score": overall,
    }


async def _update_analytics(db: AsyncSession, user_id: str, interview_score: float):
    """Update user analytics after completing an interview."""
    result = await db.execute(select(Analytics).where(Analytics.user_id == user_id))
    analytics = result.scalar_one_or_none()

    if not analytics:
        analytics = Analytics(user_id=user_id)
        db.add(analytics)

    analytics.interviews_taken += 1
    analytics.last_interview = datetime.now(timezone.utc)

    # Recalculate average
    total = analytics.average_score * (analytics.interviews_taken - 1) + interview_score
    analytics.average_score = total / analytics.interviews_taken

    if interview_score > analytics.best_score:
        analytics.best_score = interview_score

    await db.flush()
