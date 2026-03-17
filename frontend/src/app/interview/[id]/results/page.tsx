"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getResults, isAuthenticated } from "@/services/api";

interface AnswerFeedback {
  question_id: string;
  question_text: string;
  user_answer: string;
  score: number | null;
  ai_feedback: string | null;
  strengths: string | null;
  weaknesses: string | null;
  improved_answer: string | null;
}

interface InterviewResults {
  interview: { id: string; role: string; difficulty: string; status: string; total_score: number | null; created_at: string; };
  answers: AnswerFeedback[];
  overall_score: number | null;
}

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams();
  const interviewId = params.id as string;
  const [results, setResults] = useState<InterviewResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace("/login"); return; }
    async function load() {
      try { setResults(await getResults(interviewId)); } catch {}
      setLoading(false);
    }
    load();
  }, [interviewId, router]);

  const scoreClass = (score: number | null) => { if (!score) return ""; if (score >= 7) return "score-high"; if (score >= 4) return "score-mid"; return "score-low"; };
  const overallEmoji = (s: number | null) => { if (!s) return "📝"; if (s >= 8) return "🏆"; if (s >= 6) return "👍"; if (s >= 4) return "💪"; return "📚"; };
  const overallMsg = (s: number | null) => { if (!s) return "Interview in progress"; if (s >= 8) return "Outstanding performance!"; if (s >= 6) return "Great job! Keep practicing"; if (s >= 4) return "Good effort! Room for growth"; return "Keep practicing, you'll get there!"; };

  if (loading || !results) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid var(--accent-primary)", borderTopColor: "transparent", animation: "spin-slow 1s linear infinite" }} />
    </div>
  );

  return (
    <div className="bg-grid" style={{ minHeight: "100vh", position: "relative" }}>
      <div className="bg-glow-orb" style={{ top: "-200px", left: "-100px" }} />
      <div className="bg-glow-orb" style={{ bottom: "-200px", right: "-100px", background: "radial-gradient(circle, rgba(0, 206, 201, 0.15) 0%, transparent 70%)" }} />

      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 32px", borderBottom: "1px solid var(--border-color)",
        background: "rgba(10, 10, 15, 0.8)", backdropFilter: "blur(20px)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => router.push("/dashboard")}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-gradient)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎯</div>
          <span style={{ fontWeight: 700, fontSize: 18 }}>InterviewAI</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn-secondary" onClick={() => router.push("/interview/start")} style={{ padding: "8px 20px" }}>New Interview</button>
          <button className="btn-secondary" onClick={() => router.push("/dashboard")} style={{ padding: "8px 20px" }}>Dashboard</button>
        </div>
      </nav>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px", position: "relative", zIndex: 1 }}>
        {/* Overall score */}
        <div className="animate-slide-up glass-card" style={{
          padding: 48, textAlign: "center", marginBottom: 40,
          background: "linear-gradient(135deg, rgba(108, 92, 231, 0.08) 0%, rgba(0, 206, 201, 0.05) 100%)",
        }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>{overallEmoji(results.overall_score)}</div>
          <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>Interview Complete</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 16, marginBottom: 24 }}>{overallMsg(results.overall_score)}</p>

          {results.overall_score !== null && (
            <div style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 72, fontWeight: 900, background: "var(--accent-gradient)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                {results.overall_score.toFixed(1)}
              </span>
              <span style={{ fontSize: 24, color: "var(--text-muted)", fontWeight: 600 }}>/ 10</span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 32 }}>
            <div><div style={{ fontSize: 20, fontWeight: 700 }}>{results.interview.role}</div><div style={{ fontSize: 12, color: "var(--text-muted)" }}>Role</div></div>
            <div style={{ width: 1, background: "var(--border-color)" }} />
            <div><div style={{ fontSize: 20, fontWeight: 700, textTransform: "capitalize" }}>{results.interview.difficulty}</div><div style={{ fontSize: 12, color: "var(--text-muted)" }}>Difficulty</div></div>
            <div style={{ width: 1, background: "var(--border-color)" }} />
            <div><div style={{ fontSize: 20, fontWeight: 700 }}>{results.answers.length}</div><div style={{ fontSize: 12, color: "var(--text-muted)" }}>Questions</div></div>
          </div>
        </div>

        {/* Score bars */}
        <div className="animate-fade-in" style={{ marginBottom: 32, animationDelay: "0.1s", opacity: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Score Distribution</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "end", height: 120 }}>
            {results.answers.map((a, i) => {
              const h = a.score ? (a.score / 10) * 100 : 10;
              const color = a.score && a.score >= 7 ? "var(--success)" : a.score && a.score >= 4 ? "var(--warning)" : "var(--danger)";
              return (
                <div key={i} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ height: `${h}%`, background: `linear-gradient(180deg, ${color} 0%, ${color}44 100%)`, borderRadius: "6px 6px 0 0", minHeight: 8, transition: "height 0.5s ease", transitionDelay: `${i * 0.1}s` }} />
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>Q{i + 1}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed feedback */}
        <div className="animate-fade-in" style={{ animationDelay: "0.2s", opacity: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Detailed Feedback</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {results.answers.map((a, i) => (
              <div key={i} className="glass-card" style={{ overflow: "hidden" }}>
                <div style={{ padding: 20, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                  onClick={() => setExpandedQ(expandedQ === i ? null : i)}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-secondary)", marginBottom: 4 }}>Question {i + 1}</div>
                    <div style={{ fontWeight: 500, fontSize: 15, lineHeight: 1.4 }}>{a.question_text}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: 16 }}>
                    <span className={`score-badge ${scoreClass(a.score)}`}>{a.score?.toFixed(1) ?? "—"}</span>
                    <span style={{ fontSize: 18, color: "var(--text-muted)", transform: expandedQ === i ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.3s ease" }}>▼</span>
                  </div>
                </div>
                {expandedQ === i && (
                  <div style={{ padding: "0 20px 20px", borderTop: "1px solid var(--border-color)", paddingTop: 20 }}>
                    <div style={{ padding: 16, borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>Your Answer</div>
                      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{a.user_answer || "No answer"}</p>
                    </div>
                    {a.ai_feedback && <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16 }}>{a.ai_feedback}</p>}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                      {a.strengths && <div style={{ padding: 14, borderRadius: "var(--radius-sm)", background: "rgba(0,206,201,0.05)", border: "1px solid rgba(0,206,201,0.12)" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--success)", marginBottom: 6 }}>✓ Strengths</div>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{a.strengths}</p>
                      </div>}
                      {a.weaknesses && <div style={{ padding: 14, borderRadius: "var(--radius-sm)", background: "rgba(255,107,107,0.05)", border: "1px solid rgba(255,107,107,0.12)" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--danger)", marginBottom: 6 }}>✗ Weaknesses</div>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{a.weaknesses}</p>
                      </div>}
                    </div>
                    {a.improved_answer && <div style={{ padding: 14, borderRadius: "var(--radius-sm)", background: "rgba(108,92,231,0.05)", border: "1px solid rgba(108,92,231,0.12)" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-secondary)", marginBottom: 6 }}>💡 Model Answer</div>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{a.improved_answer}</p>
                    </div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="animate-fade-in" style={{ textAlign: "center", marginTop: 40, paddingBottom: 40, animationDelay: "0.3s", opacity: 0 }}>
          <button className="btn-primary" onClick={() => router.push("/interview/start")} style={{ marginRight: 12 }}>🎯 New Interview</button>
          <button className="btn-secondary" onClick={() => router.push("/dashboard")}>← Dashboard</button>
        </div>
      </main>
    </div>
  );
}
