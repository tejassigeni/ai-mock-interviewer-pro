"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAnalytics, getInterviewHistory, isAuthenticated, getUser, clearAuth } from "@/services/api";

interface InterviewSummary {
  id: string;
  role: string;
  difficulty: string;
  status: string;
  total_score: number | null;
  created_at: string;
  questions_count: number;
}

interface Analytics {
  average_score: number;
  interviews_taken: number;
  total_questions_answered: number;
  best_score: number;
  last_interview: string | null;
  recent_interviews: InterviewSummary[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    setUser(getUser());

    async function loadData() {
      try {
        const [analyticsData, historyData] = await Promise.all([
          getAnalytics().catch(() => null),
          getInterviewHistory().catch(() => []),
        ]);
        if (analyticsData) setAnalytics(analyticsData);
      } catch {}
      setLoading(false);
    }
    loadData();
  }, [router]);

  if (!isAuthenticated() || loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid var(--accent-primary)", borderTopColor: "transparent", animation: "spin-slow 1s linear infinite" }} />
      </div>
    );
  }

  const scoreClass = (score: number | null) => {
    if (!score) return "";
    if (score >= 7) return "score-high";
    if (score >= 4) return "score-mid";
    return "score-low";
  };

  const handleSignOut = () => {
    clearAuth();
    router.push("/login");
  };

  return (
    <div className="bg-grid" style={{ minHeight: "100vh", position: "relative" }}>
      <div className="bg-glow-orb" style={{ top: "-200px", right: "-150px" }} />

      {/* Navbar */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 32px", borderBottom: "1px solid var(--border-color)",
        position: "sticky", top: 0,
        background: "rgba(10, 10, 15, 0.8)", backdropFilter: "blur(20px)", zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: "var(--accent-gradient)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>🎯</div>
          <span style={{ fontWeight: 700, fontSize: 18 }}>InterviewAI</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>{user?.name}</span>
          <button onClick={handleSignOut} style={{
            background: "transparent", border: "1px solid var(--border-color)",
            color: "var(--text-secondary)", padding: "6px 14px",
            borderRadius: "var(--radius-xs)", fontSize: 13, cursor: "pointer",
          }}>Sign out</button>
        </div>
      </nav>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px", position: "relative", zIndex: 1 }}>
        {/* Greeting */}
        <div className="animate-fade-in" style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>
            Welcome back, <span style={{
              background: "var(--accent-gradient)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>{user?.name?.split(" ")[0]}</span> 👋
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 16 }}>Ready to sharpen your interview skills?</p>
        </div>

        {/* Stats */}
        <div className="animate-fade-in" style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16, marginBottom: 40, animationDelay: "0.1s", opacity: 0,
        }}>
          {[
            { label: "Interviews", value: analytics?.interviews_taken ?? 0, icon: "📝" },
            { label: "Avg Score", value: analytics?.average_score ? `${analytics.average_score.toFixed(1)}/10` : "—", icon: "📊" },
            { label: "Best Score", value: analytics?.best_score ? `${analytics.best_score.toFixed(1)}/10` : "—", icon: "🏆" },
            { label: "Questions", value: analytics?.total_questions_answered ?? 0, icon: "❓" },
          ].map(({ label, value, icon }) => (
            <div key={label} className="glass-card" style={{ padding: 24 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{value}</div>
              <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="animate-fade-in glass-card" style={{
          padding: 40, textAlign: "center", marginBottom: 40,
          animationDelay: "0.2s", opacity: 0,
          background: "linear-gradient(135deg, rgba(108, 92, 231, 0.1) 0%, rgba(116, 185, 255, 0.05) 100%)",
        }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Start a New Interview</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Choose your role and difficulty, and let AI challenge you</p>
          <button id="start-interview-btn" className="btn-primary" onClick={() => router.push("/interview/start")} style={{ fontSize: 16, padding: "16px 40px" }}>
            🚀 Begin Interview
          </button>
        </div>

        {/* Recent interviews */}
        <div className="animate-fade-in" style={{ animationDelay: "0.3s", opacity: 0 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Recent Interviews</h2>
          {(!analytics?.recent_interviews || analytics.recent_interviews.length === 0) ? (
            <div className="glass-card" style={{ padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎤</div>
              <p style={{ color: "var(--text-secondary)" }}>No interviews yet. Start your first one!</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {analytics.recent_interviews.map((interview) => (
                <div key={interview.id} className="glass-card" style={{
                  padding: 20, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer",
                }} onClick={() =>
                  interview.status === "completed"
                    ? router.push(`/interview/${interview.id}/results`)
                    : router.push(`/interview/${interview.id}`)
                }>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {interview.role}
                      <span style={{
                        marginLeft: 8, padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 500,
                        background: "rgba(108, 92, 231, 0.1)", color: "var(--accent-secondary)", textTransform: "capitalize",
                      }}>{interview.difficulty}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      {interview.questions_count} questions · {new Date(interview.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {interview.total_score !== null && (
                      <span className={`score-badge ${scoreClass(interview.total_score)}`}>
                        {interview.total_score.toFixed(1)}
                      </span>
                    )}
                    <span style={{
                      padding: "4px 12px", borderRadius: 12, fontSize: 12,
                      background: interview.status === "completed" ? "rgba(0, 206, 201, 0.1)" : "rgba(253, 203, 110, 0.1)",
                      color: interview.status === "completed" ? "var(--success)" : "var(--warning)",
                    }}>{interview.status === "completed" ? "✓ Done" : "In Progress"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
