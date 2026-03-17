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
async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }

  return res.json();
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
  return fetchAPI("/interview/start", {
    method: "POST",
    body: JSON.stringify({ role, difficulty }),
  });
}

export async function getQuestions(interviewId: string) {
  return fetchAPI(`/interview/${interviewId}/questions`);
}

export async function submitAnswer(questionId: string, answer: string) {
  return fetchAPI("/interview/answer", {
    method: "POST",
    body: JSON.stringify({ question_id: questionId, answer }),
  });
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
export async function evaluateSpeech(question: string, answer: string, postureDescription: string = "") {
  const token = getToken();
  const res = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, answer, token, posture_description: postureDescription }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Evaluation failed" }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  return res.json();
}
