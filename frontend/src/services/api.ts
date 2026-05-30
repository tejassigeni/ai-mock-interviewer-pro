/**
 * API client for the backend.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Token management ───────────────────────────────────────
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

export function getUser(): any | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("auth_user");
  return raw ? JSON.parse(raw) : null;
}

export function setAuth(token: string, user: any) {
  localStorage.setItem("auth_token", token);
  localStorage.setItem("auth_user", JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_user");
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

// ─── Fetch wrapper ───────────────────────────────────────────
async function fetchAPI(
  endpoint: string,
  options: RequestInit = {},
  { timeoutMs = 30000, retries = 0 }: { timeoutMs?: number; retries?: number } = {}
) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: "Request failed" }));
        throw new Error(error.detail || `HTTP ${res.status}`);
      }

      return res.json();
    } catch (err: any) {
      clearTimeout(timer);

      if (err.name === "AbortError") {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        throw new Error("Request timed out. The AI is taking too long — please try again.");
      }

      if (attempt < retries && (err.message === "Failed to fetch" || err.message === "NetworkError")) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }

      throw err;
    }
  }
}

// ─── Auth ────────────────────────────────────────────────────
export async function demoLogin(name: string, email: string) {
  const data = await fetchAPI("/auth/demo", {
    method: "POST",
    body: JSON.stringify({ name, email }),
  });
  setAuth(data.access_token, data.user);
  return data;
}

export async function authWithGoogle(googleToken: string) {
  const data = await fetchAPI("/auth/google", {
    method: "POST",
    body: JSON.stringify({ token: googleToken }),
  });
  setAuth(data.access_token, data.user);
  return data;
}

// ─── Interview ───────────────────────────────────────────────
export async function startInterview(role: string, difficulty: string) {
  return fetchAPI(
    "/interview/start",
    { method: "POST", body: JSON.stringify({ role, difficulty }) },
    { timeoutMs: 90000 } // 8b model generates questions in ~10s, give plenty of buffer
  );
}

export async function getQuestions(interviewId: string) {
  return fetchAPI(`/interview/${interviewId}/questions`);
}

/** Non-streaming fallback — kept for compatibility */
export async function submitAnswer(questionId: string, answer: string) {
  return fetchAPI(
    "/interview/answer",
    { method: "POST", body: JSON.stringify({ question_id: questionId, answer }) },
    { timeoutMs: 90000, retries: 1 }
  );
}

export interface EvalResult {
  score: number;
  feedback: string;
  strengths: string;
  weaknesses: string;
  improved_answer: string;
}

/**
 * Submit an answer and stream the AI evaluation via SSE.
 * Calls onChunk with partial text as tokens arrive.
 * Calls onDone with the final structured result.
 * Calls onError if something goes wrong.
 */
export async function submitAnswerStream(
  questionId: string,
  answer: string,
  onChunk: (text: string) => void,
  onDone: (result: EvalResult) => void,
  onError: (msg: string) => void
): Promise<void> {
  const token = getToken();

  let res: Response;
  try {
    res = await fetch(`${API_URL}/interview/answer/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ question_id: questionId, answer }),
    });
  } catch (err: any) {
    onError(err.message || "Failed to connect to server");
    return;
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ detail: "Request failed" }));
    onError(errData.detail || `HTTP ${res.status}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onError("Streaming not supported");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const payload = JSON.parse(trimmed.slice(6));
          if (payload.done && payload.result) {
            onDone(payload.result as EvalResult);
          } else if (!payload.done && payload.chunk) {
            onChunk(payload.chunk);
          }
        } catch {
          // Ignore malformed lines
        }
      }
    }
  } catch (err: any) {
    onError(err.message || "Stream interrupted");
  } finally {
    reader.releaseLock();
  }
}

export async function getResults(interviewId: string) {
  return fetchAPI(`/interview/${interviewId}/results`);
}

export async function getInterviewHistory() {
  return fetchAPI("/interviews/history");
}

// ─── Analytics ───────────────────────────────────────────────
export async function getAnalytics() {
  return fetchAPI("/analytics");
}

// ─── Speech Evaluation ──────────────────────────────────────
export async function evaluateSpeech(question: string, answer: string) {
  return fetchAPI("/interview/evaluate-speech", {
    method: "POST",
    body: JSON.stringify({ question, answer }),
  });
}

// ─── Posture Evaluation ─────────────────────────────────────
export async function evaluatePosture(
  question: string,
  answer: string,
  cameraWasOn: boolean = true
) {
  return fetchAPI("/interview/evaluate-posture", {
    method: "POST",
    body: JSON.stringify({ question, answer, camera_was_on: cameraWasOn }),
  });
}
