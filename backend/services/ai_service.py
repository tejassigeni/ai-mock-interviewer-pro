"""AI Service Layer — Interacts with NVIDIA NIM API (OpenAI-compatible) for interview intelligence."""

import json
import os
import re
import asyncio
from openai import OpenAI
from typing import List, Dict

MAX_RETRIES = 3
RETRY_DELAY = 3  # seconds

# NVIDIA NIM uses OpenAI-compatible API
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_MODEL = "meta/llama-3.1-70b-instruct"


def _get_client() -> OpenAI:
    """Get configured NVIDIA NIM client."""
    api_key = os.getenv("NVIDIA_API_KEY", "")
    if not api_key:
        raise ValueError("NVIDIA_API_KEY not set in .env")
    return OpenAI(base_url=NVIDIA_BASE_URL, api_key=api_key)


def _extract_json(text: str) -> str:
    """Extract JSON from markdown code blocks or raw text."""
    match = re.search(r'```(?:json)?\s*\n?([\s\S]*?)\n?```', text)
    if match:
        return match.group(1).strip()
    match = re.search(r'(\[[\s\S]*\]|\{[\s\S]*\})', text)
    if match:
        return match.group(1).strip()
    return text.strip()


def _call_llm(prompt: str, retries: int = MAX_RETRIES) -> str:
    """Call NVIDIA NIM API with retry logic."""
    client = _get_client()
    for attempt in range(retries):
        try:
            response = client.chat.completions.create(
                model=NVIDIA_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=2048,
            )
            return response.choices[0].message.content
        except Exception as e:
            error_str = str(e).lower()
            if attempt < retries - 1 and ("rate" in error_str or "429" in error_str or "quota" in error_str):
                import time
                wait = RETRY_DELAY * (attempt + 1)
                print(f"Rate limited, retrying in {wait}s (attempt {attempt + 1}/{retries})")
                time.sleep(wait)
                continue
            raise
    raise Exception("Max retries exceeded")


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

Return ONLY a JSON array in this exact format (no extra text):
[
  {{"question": "Your question text here", "order": 1}},
  {{"question": "Your question text here", "order": 2}}
]"""

    try:
        text = await asyncio.to_thread(_call_llm, prompt)
        raw = _extract_json(text)
        questions = json.loads(raw)
        for i, q in enumerate(questions):
            q["order"] = i + 1
        return questions[:count]
    except Exception as e:
        print(f"AI question generation failed: {e}")
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
    prompt = f"""You are an expert interview evaluator. Evaluate the following interview answer.

**Question:** {question}

**Candidate's Answer:** {answer}

Evaluate thoroughly and return ONLY a JSON object in this exact format (no extra text):
{{
  "score": <number from 1 to 10>,
  "feedback": "<brief overall assessment, 2-3 sentences>",
  "strengths": "<what the candidate did well, 1-2 sentences>",
  "weaknesses": "<areas for improvement, 1-2 sentences>",
  "improved_answer": "<a model answer that would score 9-10, 2-4 sentences>"
}}"""

    try:
        text = await asyncio.to_thread(_call_llm, prompt)
        raw = _extract_json(text)
        result = json.loads(raw)
        result["score"] = max(1.0, min(10.0, float(result.get("score", 5))))
        return result
    except Exception as e:
        print(f"AI evaluation failed: {e}")
        return {
            "score": 5.0,
            "feedback": "Unable to evaluate at this time. Please review your answer manually.",
            "strengths": "Answer was provided.",
            "weaknesses": "Could not be evaluated by AI.",
            "improved_answer": "N/A",
        }


async def generate_followup(question: str, answer: str) -> str:
    """Generate a follow-up question based on the candidate's answer."""
    prompt = f"""Based on this interview exchange, generate ONE follow-up question.

**Original Question:** {question}
**Candidate's Answer:** {answer}

The follow-up should probe deeper into the candidate's knowledge or ask for clarification.
Return ONLY the follow-up question text, nothing else."""

    try:
        text = await asyncio.to_thread(_call_llm, prompt)
        return text.strip().strip('"')
    except Exception as e:
        print(f"AI follow-up generation failed: {e}")
        return "Can you elaborate more on your previous answer?"
