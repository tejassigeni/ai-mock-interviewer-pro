"""AI Service Layer — Interacts with NVIDIA NIM API (OpenAI-compatible) for interview intelligence."""

import json
import os
import re
import asyncio
import traceback
from openai import AsyncOpenAI
from typing import List, Dict, AsyncGenerator

MAX_RETRIES = 1          # 1 retry max — 8b model rarely benefits from more
RETRY_DELAY = 1.5        # seconds between retries

# NVIDIA NIM uses OpenAI-compatible API
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

# llama-3.1-8b-instruct: 5-8x faster than 70b, excellent quality for interview Q&A
NVIDIA_MODEL = "meta/llama-3.1-8b-instruct"

# Timeout for a single LLM call (seconds)
LLM_CALL_TIMEOUT = 30

# Reusable async client (created once, not per-call)
_client = None


def _get_client() -> AsyncOpenAI:
    """Get or create a configured NVIDIA NIM async client (singleton)."""
    global _client
    if _client is not None:
        return _client
    api_key = os.getenv("NVIDIA_API_KEY", "")
    if not api_key:
        raise ValueError("NVIDIA_API_KEY not set in .env")
    _client = AsyncOpenAI(
        base_url=NVIDIA_BASE_URL,
        api_key=api_key,
        timeout=25.0,  # HTTP-level timeout — tighter for 8b model
    )
    return _client


def _extract_json(text: str) -> str:
    """Extract JSON from markdown code blocks or raw text."""
    match = re.search(r'```(?:json)?\s*\n?([\s\S]*?)\n?```', text)
    if match:
        return match.group(1).strip()
    match = re.search(r'(\[[\s\S]*\]|\{[\s\S]*\})', text)
    if match:
        return match.group(1).strip()
    return text.strip()


async def _call_llm(prompt: str, retries: int = MAX_RETRIES, max_tokens: int = 400, temperature: float = 0.4) -> str:
    """Call NVIDIA NIM API with async retry logic and timeout."""
    client = _get_client()
    last_error = None
    for attempt in range(retries + 1):
        try:
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model=NVIDIA_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=temperature,
                    max_tokens=max_tokens,
                ),
                timeout=LLM_CALL_TIMEOUT,
            )
            result = response.choices[0].message.content
            if result:
                return result
            raise Exception("Empty response from LLM")
        except asyncio.TimeoutError:
            last_error = f"Timeout after {LLM_CALL_TIMEOUT}s"
            print(f"[AI] LLM call timed out (attempt {attempt + 1}/{retries + 1})")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            last_error = str(e)
            print(f"[AI] LLM call failed (attempt {attempt + 1}/{retries + 1}): {type(e).__name__}: {e}")

        if attempt < retries:
            wait = RETRY_DELAY * (attempt + 1)
            print(f"[AI] Retrying in {wait}s...")
            await asyncio.sleep(wait)

    raise Exception(f"LLM call failed after {retries + 1} attempts. Last error: {last_error}")


async def stream_llm(prompt: str, max_tokens: int = 400, temperature: float = 0.4) -> AsyncGenerator[str, None]:
    """Stream tokens from the LLM. Yields text chunks as they arrive."""
    client = _get_client()
    try:
        stream = await client.chat.completions.create(
            model=NVIDIA_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta
    except Exception as e:
        print(f"[AI] Streaming failed: {e}")
        yield ""


async def generate_questions(role: str, difficulty: str, count: int = 5) -> List[Dict]:
    """
    Generate interview questions using NVIDIA NIM.
    Returns a list of question dicts: [{"question": "...", "order": 1}, ...]
    """
    prompt = f"""You are an expert technical interviewer. Generate exactly {count} interview questions for a **{role}** role.

Difficulty level: **{difficulty}**

Requirements:
- Questions should be practical and relevant to real interviews
- Mix of conceptual and scenario-based questions
- Progressively increasing difficulty within the set
- For technical roles, include coding/design questions

Return ONLY a JSON array in this exact format (no extra text, no markdown):
[
  {{"question": "Your question text here", "order": 1}},
  {{"question": "Your question text here", "order": 2}}
]"""

    try:
        text = await _call_llm(prompt, max_tokens=600, temperature=0.6)
        raw = _extract_json(text)
        questions = json.loads(raw)
        for i, q in enumerate(questions):
            q["order"] = i + 1
        print(f"[AI] Generated {len(questions)} questions for {role}/{difficulty}")
        return questions[:count]
    except Exception as e:
        print(f"[AI] Question generation failed: {e}")
        traceback.print_exc()
        return [
            {"question": f"Tell me about your experience with {role}.", "order": 1},
            {"question": f"What are the key challenges in {role}?", "order": 2},
            {"question": f"Describe a project where you applied {role} skills.", "order": 3},
            {"question": f"How do you stay updated in the {role} domain?", "order": 4},
            {"question": f"Where do you see {role} heading in the next 5 years?", "order": 5},
        ][:count]


async def evaluate_answer(question: str, answer: str) -> Dict:
    """
    Evaluate a candidate's answer using NVIDIA NIM.
    Returns: {"score": float, "feedback": str, "strengths": str, "weaknesses": str, "improved_answer": str}
    """
    prompt = f"""You are an expert interview evaluator. Evaluate the following interview answer concisely.

**Question:** {question}

**Candidate's Answer:** {answer}

Return ONLY a JSON object (no extra text, no markdown):
{{
  "score": <number 1-10>,
  "feedback": "<2 sentence overall assessment>",
  "strengths": "<1 sentence on what they did well>",
  "weaknesses": "<1 sentence on areas to improve>",
  "improved_answer": "<2-3 sentence model answer>"
}}"""

    try:
        text = await _call_llm(prompt, max_tokens=350, temperature=0.3)
        raw = _extract_json(text)
        result = json.loads(raw)
        result["score"] = max(1.0, min(10.0, float(result.get("score", 5))))
        print(f"[AI] Evaluated answer — score: {result['score']}")
        return result
    except Exception as e:
        print(f"[AI] *** Evaluation FAILED, returning fallback: {e}")
        traceback.print_exc()
        return {
            "score": 5.0,
            "feedback": "Unable to evaluate at this time. Please review your answer manually.",
            "strengths": "Answer was provided.",
            "weaknesses": "Could not be evaluated by AI.",
            "improved_answer": "N/A",
        }


async def evaluate_answer_stream(question: str, answer: str) -> AsyncGenerator[str, None]:
    """
    Stream an answer evaluation — yields SSE-formatted JSON chunks.
    Sends data as: data: <json>\n\n
    """
    prompt = f"""You are an expert interview evaluator. Evaluate the following interview answer concisely.

**Question:** {question}

**Candidate's Answer:** {answer}

Return ONLY a JSON object (no extra text, no markdown):
{{
  "score": <number 1-10>,
  "feedback": "<2 sentence overall assessment>",
  "strengths": "<1 sentence on what they did well>",
  "weaknesses": "<1 sentence on areas to improve>",
  "improved_answer": "<2-3 sentence model answer>"
}}"""

    full_text = ""
    try:
        async for chunk in stream_llm(prompt, max_tokens=350, temperature=0.3):
            full_text += chunk
            # Stream raw chunk so client can show partial text
            yield f"data: {json.dumps({'chunk': chunk, 'done': False})}\n\n"

        # Parse the complete JSON and send final structured result
        raw = _extract_json(full_text)
        result = json.loads(raw)
        result["score"] = max(1.0, min(10.0, float(result.get("score", 5))))
        print(f"[AI] Streamed evaluation — score: {result['score']}")
        yield f"data: {json.dumps({'result': result, 'done': True})}\n\n"
    except Exception as e:
        print(f"[AI] Stream evaluation failed: {e}")
        fallback = {
            "score": 5.0,
            "feedback": "Unable to evaluate at this time.",
            "strengths": "Answer was provided.",
            "weaknesses": "Could not be evaluated by AI.",
            "improved_answer": "N/A",
        }
        yield f"data: {json.dumps({'result': fallback, 'done': True, 'error': str(e)})}\n\n"


async def generate_followup(question: str, answer: str) -> str:
    """Generate a follow-up question based on the candidate's answer."""
    prompt = f"""Based on this interview exchange, generate ONE follow-up question.

**Original Question:** {question}
**Candidate's Answer:** {answer}

The follow-up should probe deeper. Return ONLY the question text, nothing else."""

    try:
        text = await _call_llm(prompt, max_tokens=100, temperature=0.5)
        return text.strip().strip('"')
    except Exception as e:
        print(f"[AI] Follow-up generation failed: {e}")
        return "Can you elaborate more on your previous answer?"


async def evaluate_speech(question: str, answer: str) -> Dict:
    """
    Evaluate a spoken answer's delivery quality using AI.
    Returns: {"speech_score": float, "clarity": str, "structure": str, "confidence": str, "filler_words": str, "tips": str}
    """
    prompt = f"""You are an expert interview coach evaluating a candidate's SPOKEN answer delivery.

**Interview Question:** {question}
**Transcribed Spoken Answer:** {answer}

Evaluate the DELIVERY (not content). Return ONLY a JSON object (no markdown):
{{
  "speech_score": <number 1-10>,
  "clarity": "<was it clear? 1 sentence>",
  "structure": "<was it well-structured? 1 sentence>",
  "confidence": "<did they sound confident? 1 sentence>",
  "filler_words": "<any filler words/hesitations? 1 sentence>",
  "tips": "<2 specific tips to improve delivery>"
}}"""

    try:
        text = await _call_llm(prompt, max_tokens=300, temperature=0.3)
        raw = _extract_json(text)
        result = json.loads(raw)
        result["speech_score"] = max(1.0, min(10.0, float(result.get("speech_score", 5))))
        print(f"[AI] Evaluated speech — score: {result['speech_score']}")
        return result
    except Exception as e:
        print(f"[AI] Speech evaluation failed: {e}")
        return {
            "speech_score": 5.0,
            "clarity": "Speech evaluation unavailable.",
            "structure": "Could not analyze structure.",
            "confidence": "Could not assess confidence.",
            "filler_words": "No analysis available.",
            "tips": "Practice speaking clearly and at a moderate pace. Use the STAR method to structure your answers.",
        }


async def evaluate_posture(question: str, answer: str, camera_was_on: bool = True) -> Dict:
    """
    Generate camera/presentation feedback tips based on the interview context.
    Returns: {"posture_score": float, "eye_contact": str, "body_language": str, "expression": str, "presentation_tips": str}
    """
    prompt = f"""You are an expert interview presentation coach. Provide camera and body language coaching tips.

**Interview Question:** {question}
**Candidate's Answer:** {answer}
**Camera was on:** {camera_was_on}

Return ONLY a JSON object (no markdown):
{{
  "posture_score": <number 1-10>,
  "eye_contact": "<tip about eye contact for this answer. 1 sentence>",
  "body_language": "<tip about posture/body language. 1 sentence>",
  "expression": "<tip about facial expression. 1 sentence>",
  "presentation_tips": "<2 specific actionable tips for this answer on camera>"
}}"""

    try:
        text = await _call_llm(prompt, max_tokens=280, temperature=0.3)
        raw = _extract_json(text)
        result = json.loads(raw)
        result["posture_score"] = max(1.0, min(10.0, float(result.get("posture_score", 6))))
        print(f"[AI] Evaluated posture — score: {result['posture_score']}")
        return result
    except Exception as e:
        print(f"[AI] Posture evaluation failed: {e}")
        return {
            "posture_score": 6.0,
            "eye_contact": "Look directly at the camera lens to simulate eye contact with the interviewer.",
            "body_language": "Sit upright with shoulders back. Use open hand gestures to emphasize key points.",
            "expression": "Maintain a warm, engaged expression. Smile naturally when discussing achievements.",
            "presentation_tips": "1. Position your camera at eye level. 2. Keep your hands visible and use them for emphasis.",
        }
