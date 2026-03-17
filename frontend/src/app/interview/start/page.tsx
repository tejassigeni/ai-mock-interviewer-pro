"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { startInterview, isAuthenticated } from "@/services/api";

const ROLES = [
  { id: "dsa", label: "DSA / Algorithms", icon: "💻", description: "Data structures, algorithms, and problem solving" },
  { id: "system-design", label: "System Design", icon: "🏗️", description: "Architecture, scalability, and distributed systems" },
  { id: "hr", label: "HR / Behavioral", icon: "🤝", description: "Leadership, teamwork, and situational questions" },
  { id: "cybersecurity", label: "Cybersecurity", icon: "🔒", description: "Security principles, threats, and best practices" },
  { id: "frontend", label: "Frontend", icon: "🎨", description: "React, CSS, performance, and web technologies" },
  { id: "backend", label: "Backend", icon: "⚙️", description: "APIs, databases, server architecture" },
  { id: "devops", label: "DevOps / Cloud", icon: "☁️", description: "CI/CD, containers, cloud platforms" },
  { id: "ml", label: "Machine Learning", icon: "🤖", description: "ML concepts, models, and data science" },
];

const DIFFICULTIES = [
  { id: "easy", label: "Easy", color: "var(--success)", description: "Fundamentals & basics" },
  { id: "medium", label: "Medium", color: "var(--warning)", description: "Intermediate concepts" },
  { id: "hard", label: "Hard", color: "var(--danger)", description: "Advanced & tricky" },
];

export default function StartInterviewPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

  const handleStart = async () => {
    if (!selectedRole || !selectedDifficulty) return;
    setIsStarting(true);
    setError("");
    try {
      const interview = await startInterview(selectedRole, selectedDifficulty);
      router.push(`/interview/${interview.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to start interview. Is the backend running?");
      setIsStarting(false);
    }
  };

  return (
    <div className="bg-grid" style={{ minHeight: "100vh", position: "relative" }}>
      <div className="bg-glow-orb" style={{ top: "-200px", left: "50%", transform: "translateX(-50%)" }} />

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
        <button className="btn-secondary" onClick={() => router.push("/dashboard")} style={{ padding: "8px 20px" }}>← Back</button>
      </nav>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px", position: "relative", zIndex: 1 }}>
        <div className="animate-fade-in" style={{ textAlign: "center", marginBottom: 48 }}>
          <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 12 }}>
            Choose Your <span style={{ background: "var(--accent-gradient)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Interview</span>
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 16 }}>Select a role and difficulty level to begin</p>
        </div>

        {/* Role Selection */}
        <div className="animate-fade-in" style={{ marginBottom: 40, animationDelay: "0.1s", opacity: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "var(--text-secondary)" }}>1. Select Role</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {ROLES.map((role) => (
              <div key={role.id} className="glass-card" onClick={() => setSelectedRole(role.id)} style={{
                padding: 20, cursor: "pointer",
                borderColor: selectedRole === role.id ? "var(--accent-primary)" : undefined,
                boxShadow: selectedRole === role.id ? "0 0 20px var(--accent-glow)" : undefined,
                transform: selectedRole === role.id ? "translateY(-2px)" : undefined,
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{role.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{role.label}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>{role.description}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div className="animate-fade-in" style={{ marginBottom: 40, animationDelay: "0.2s", opacity: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "var(--text-secondary)" }}>2. Select Difficulty</h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {DIFFICULTIES.map((diff) => (
              <div key={diff.id} className="glass-card" onClick={() => setSelectedDifficulty(diff.id)} style={{
                padding: "20px 32px", cursor: "pointer", flex: 1, minWidth: 150, textAlign: "center",
                borderColor: selectedDifficulty === diff.id ? diff.color : undefined,
                boxShadow: selectedDifficulty === diff.id ? `0 0 20px ${diff.color}33` : undefined,
              }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: diff.color, marginBottom: 4 }}>{diff.label}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{diff.description}</div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div style={{
            padding: 16, borderRadius: "var(--radius-sm)",
            background: "rgba(255, 107, 107, 0.1)", border: "1px solid rgba(255, 107, 107, 0.3)",
            color: "var(--danger)", marginBottom: 24, textAlign: "center", fontSize: 14,
          }}>{error}</div>
        )}

        <div className="animate-fade-in" style={{ textAlign: "center", animationDelay: "0.3s", opacity: 0 }}>
          <button id="begin-interview-btn" className="btn-primary" onClick={handleStart}
            disabled={!selectedRole || !selectedDifficulty || isStarting}
            style={{ fontSize: 16, padding: "16px 48px" }}>
            {isStarting ? (
              <>
                <span style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid white", borderTopColor: "transparent", animation: "spin-slow 0.8s linear infinite", display: "inline-block" }} />
                Generating questions...
              </>
            ) : "🎯 Start Interview"}
          </button>
        </div>
      </main>
    </div>
  );
}
