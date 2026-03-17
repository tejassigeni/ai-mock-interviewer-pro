"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { demoLogin, isAuthenticated } from "@/services/api";
import { useEffect } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated()) router.replace("/dashboard");
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Please enter your name and email");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      await demoLogin(name.trim(), email.trim());
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Login failed");
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-grid" style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      {/* Background glow orbs */}
      <div className="bg-glow-orb" style={{ top: "-150px", left: "-100px" }} />
      <div className="bg-glow-orb" style={{ bottom: "-200px", right: "-100px", background: "radial-gradient(circle, rgba(116, 185, 255, 0.2) 0%, transparent 70%)" }} />

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100vh", padding: "20px", position: "relative", zIndex: 1,
      }}>
        <div className="animate-slide-up" style={{ textAlign: "center", maxWidth: 480, width: "100%" }}>
          {/* Logo */}
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: "var(--accent-gradient)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 32px", fontSize: 36,
            boxShadow: "0 8px 32px var(--accent-glow)",
          }}>
            🎯
          </div>

          <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 800, marginBottom: 12, lineHeight: 1.1 }}>
            <span style={{
              background: "var(--accent-gradient)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>AI Mock</span>
            <br />Interviewer
          </h1>

          <p style={{
            color: "var(--text-secondary)", fontSize: 17, lineHeight: 1.6,
            marginBottom: 40, maxWidth: 380, marginLeft: "auto", marginRight: "auto",
          }}>
            Practice interviews with AI-powered questions, get instant feedback, and track your progress to landing your dream job.
          </p>

          {/* Feature pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 40 }}>
            {["DSA", "System Design", "HR", "Cybersecurity", "Frontend", "Backend", "DevOps", "ML"].map((tag) => (
              <span key={tag} style={{
                padding: "6px 16px", borderRadius: 20,
                background: "rgba(108, 92, 231, 0.1)", border: "1px solid rgba(108, 92, 231, 0.2)",
                color: "var(--accent-secondary)", fontSize: 13, fontWeight: 500,
              }}>{tag}</span>
            ))}
          </div>

          {/* Login card */}
          <form onSubmit={handleLogin}>
            <div className="glass-card" style={{ padding: 32, textAlign: "left" }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, textAlign: "center" }}>
                Get Started
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24, textAlign: "center" }}>
                Enter your name and email to begin practicing
              </p>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Your Name
                </label>
                <input
                  id="name-input"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Tejas"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Email
                </label>
                <input
                  id="email-input"
                  type="email"
                  className="input-field"
                  placeholder="e.g. tejas@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {error && (
                <div style={{
                  padding: 12, borderRadius: "var(--radius-xs)",
                  background: "rgba(255, 107, 107, 0.1)", border: "1px solid rgba(255, 107, 107, 0.3)",
                  color: "var(--danger)", fontSize: 13, marginBottom: 16, textAlign: "center",
                }}>{error}</div>
              )}

              <button
                id="login-btn"
                type="submit"
                className="btn-primary"
                disabled={isLoading}
                style={{ width: "100%", justifyContent: "center", fontSize: 16, padding: "16px 32px" }}
              >
                {isLoading ? (
                  <>
                    <span style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid white", borderTopColor: "transparent", animation: "spin-slow 0.8s linear infinite", display: "inline-block" }} />
                    Signing in...
                  </>
                ) : "🚀 Start Practicing"}
              </button>
            </div>
          </form>

          {/* Stats */}
          <div style={{ display: "flex", justifyContent: "center", gap: 40, marginTop: 40 }}>
            {[
              { value: "50+", label: "Interview topics" },
              { value: "AI", label: "Powered feedback" },
              { value: "∞", label: "Practice sessions" },
            ].map(({ value, label }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: 24, fontWeight: 800,
                  background: "var(--accent-gradient)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>{value}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
