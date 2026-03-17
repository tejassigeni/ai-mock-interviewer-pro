import { NextResponse } from "next/server";

/**
 * POST /api/evaluate
 * Proxies to the FastAPI backend to evaluate an interview answer
 * with confidence/clarity scores + optional posture assessment.
 * 
 * API key stays server-side — never exposed to the client.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function POST(req: Request) {
  try {
    const { question, answer, token, posture_description } = await req.json();

    if (!question || !answer) {
      return NextResponse.json(
        { error: "question and answer are required" },
        { status: 400 }
      );
    }

    const backendRes = await fetch(`${API_URL}/interview/evaluate-speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ question, answer, posture_description: posture_description || "" }),
    });

    if (!backendRes.ok) {
      const errData = await backendRes.json().catch(() => ({ detail: "Backend error" }));
      return NextResponse.json(
        { error: errData.detail || "Evaluation failed" },
        { status: backendRes.status }
      );
    }

    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Evaluate API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
