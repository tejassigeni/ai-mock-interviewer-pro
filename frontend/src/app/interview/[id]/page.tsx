"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  getQuestions,
  submitAnswerStream,
  evaluateSpeech,
  evaluatePosture,
  isAuthenticated,
  EvalResult,
} from "@/services/api";

interface Question {
  id: string;
  question_text: string;
  order: number;
}

interface AnswerFeedback {
  score: number | null;
  ai_feedback: string | null;
  strengths: string | null;
  weaknesses: string | null;
  improved_answer: string | null;
}

interface SpeechFeedback {
  speech_score: number;
  clarity: string;
  structure: string;
  confidence: string;
  filler_words: string;
  tips: string;
}

interface PostureFeedback {
  posture_score: number;
  eye_contact: string;
  body_language: string;
  expression: string;
  presentation_tips: string;
}

export default function InterviewSessionPage() {
  const router = useRouter();
  const params = useParams();
  const interviewId = params.id as string;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [speechFeedback, setSpeechFeedback] = useState<SpeechFeedback | null>(null);
  const [postureFeedback, setPostureFeedback] = useState<PostureFeedback | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Streaming state
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // Track if current answer was spoken
  const [wasSpoken, setWasSpoken] = useState(false);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  // ─── Camera state ──────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");

  // ─── Speech-to-text state ─────────────────────────────────
  const recognitionRef = useRef<any>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

  useEffect(() => {
    async function load() {
      try {
        const q = await getQuestions(interviewId);
        setQuestions(q);
      } catch (err: any) {
        setError(err.message || "Failed to load questions");
      }
      setLoading(false);
    }
    if (isAuthenticated()) load();
  }, [interviewId]);

  // Check speech recognition support
  useEffect(() => {
    const SpeechRecognition =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    setSpeechSupported(!!SpeechRecognition);
  }, []);

  // Camera lifecycle — stop on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Timer
  useEffect(() => {
    if (!timerActive) return;
    const interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [timerActive]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // ─── Camera controls ──────────────────────────────────────
  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraOn(false);
      setCameraError("");
    } else {
      try {
        setCameraError("");
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraOn(true);
      } catch (e: any) {
        console.error("Camera error:", e);
        setCameraError("Camera access denied. Please allow camera in your browser settings.");
      }
    }
  }, [cameraOn]);

  // ─── Speech-to-text controls ──────────────────────────────
  const toggleSpeech = useCallback(() => {
    if (isSpeaking) {
      recognitionRef.current?.stop();
      setIsSpeaking(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = answer;

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? " " : "") + transcript;
        } else {
          interim += transcript;
        }
      }
      setAnswer(finalTranscript + (interim ? " " + interim : ""));
      setWasSpoken(true);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsSpeaking(false);
    };

    recognition.onend = () => {
      setIsSpeaking(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsSpeaking(true);
  }, [isSpeaking, answer]);

  // ─── Submit with streaming evaluation ─────────────────────
  const handleSubmit = useCallback(async () => {
    if (!answer.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setIsStreaming(true);
    setStreamingText("");
    setError("");

    // Stop speech if active
    if (isSpeaking) {
      recognitionRef.current?.stop();
      setIsSpeaking(false);
    }

    const questionText = questions[currentIndex].question_text;
    const currentAnswer = answer;
    const spokenFlag = wasSpoken;
    const cameraFlag = cameraOn;

    // Fire speech + posture evaluations concurrently in the background
    const bgPromises: Promise<void>[] = [];
    if (spokenFlag) {
      bgPromises.push(
        evaluateSpeech(questionText, currentAnswer)
          .then((data: SpeechFeedback) => setSpeechFeedback(data))
          .catch((e: any) => console.error("Speech evaluation failed:", e))
      );
    }
    if (cameraFlag) {
      bgPromises.push(
        evaluatePosture(questionText, currentAnswer, true)
          .then((data: PostureFeedback) => setPostureFeedback(data))
          .catch((e: any) => console.error("Posture evaluation failed:", e))
      );
    }
    // Fire them concurrently — don't await here, let them resolve in background
    if (bgPromises.length > 0) {
      Promise.all(bgPromises);
    }

    // Stream the main answer evaluation
    await submitAnswerStream(
      questions[currentIndex].id,
      currentAnswer,
      // onChunk — show tokens as they arrive
      (chunk: string) => {
        setStreamingText((prev) => prev + chunk);
      },
      // onDone — final structured result
      (result: EvalResult) => {
        setFeedback({
          score: result.score,
          ai_feedback: result.feedback,
          strengths: result.strengths,
          weaknesses: result.weaknesses,
          improved_answer: result.improved_answer,
        });
        setAnsweredCount((c) => c + 1);
        setTimerActive(false);
        setIsStreaming(false);
        setIsSubmitting(false);
      },
      // onError
      (msg: string) => {
        setError(msg);
        setIsStreaming(false);
        setIsSubmitting(false);
      }
    );
  }, [answer, isSubmitting, questions, currentIndex, isSpeaking, wasSpoken, cameraOn]);

  const handleRetry = () => {
    setError("");
    handleSubmit();
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setAnswer("");
      setFeedback(null);
      setSpeechFeedback(null);
      setPostureFeedback(null);
      setStreamingText("");
      setWasSpoken(false);
      setTimer(0);
      setTimerActive(true);
      setError("");
    } else {
      router.push(`/interview/${interviewId}/results`);
    }
  };

  const scoreClass = (score: number | null) => {
    if (!score) return "";
    if (score >= 7) return "score-high";
    if (score >= 4) return "score-mid";
    return "score-low";
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid var(--accent-primary)", borderTopColor: "transparent", animation: "spin-slow 1s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading questions...</p>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];

  return (
    <div className="bg-grid" style={{ minHeight: "100vh", position: "relative" }}>
      <div className="bg-glow-orb" style={{ top: "-200px", right: "-150px" }} />

      {/* ─── Webcam Preview (floating PiP) ─────────────────── */}
      <div className={`webcam-container ${cameraOn ? "webcam-active" : ""}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "50%",
            display: cameraOn ? "block" : "none",
          }}
        />
        {!cameraOn && (
          <div style={{
            width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "50%", background: "var(--bg-secondary)", fontSize: 32,
          }}>
            📷
          </div>
        )}
        <button
          onClick={toggleCamera}
          className="webcam-toggle"
          title={cameraOn ? "Turn off camera" : "Turn on camera"}
        >
          {cameraOn ? "✕" : "📹"}
        </button>
      </div>

      {cameraError && (
        <div style={{
          position: "fixed", bottom: 160, left: 24, zIndex: 100,
          padding: "10px 16px", borderRadius: "var(--radius-sm)",
          background: "rgba(255, 107, 107, 0.15)", border: "1px solid rgba(255, 107, 107, 0.3)",
          color: "var(--danger)", fontSize: 13, maxWidth: 280,
        }}>{cameraError}</div>
      )}

      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 32px", borderBottom: "1px solid var(--border-color)",
        background: "rgba(10, 10, 15, 0.8)", backdropFilter: "blur(20px)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-gradient)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎯</div>
          <span style={{ fontWeight: 700, fontSize: 18 }}>Interview Session</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {questions.map((_, i) => (
              <div key={i} style={{
                width: i === currentIndex ? 24 : 10, height: 10, borderRadius: 5,
                background: i < answeredCount ? "var(--success)" : i === currentIndex ? "var(--accent-primary)" : "var(--border-color)",
                transition: "all 0.3s ease",
              }} />
            ))}
          </div>
          <button
            onClick={() => setShowAbortConfirm(true)}
            style={{
              background: "rgba(255, 107, 107, 0.1)", border: "1px solid rgba(255, 107, 107, 0.3)",
              color: "var(--danger)", padding: "6px 14px", borderRadius: "var(--radius-xs)",
              fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255, 107, 107, 0.2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255, 107, 107, 0.1)"; }}
          >
            ✕ Abort Test
          </button>
          <div style={{
            fontFamily: "monospace", fontSize: 18, fontWeight: 600,
            color: timer > 300 ? "var(--danger)" : "var(--text-secondary)",
            padding: "6px 14px", borderRadius: "var(--radius-xs)", background: "var(--bg-secondary)",
          }}>⏱ {formatTime(timer)}</div>
        </div>
      </nav>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px", position: "relative", zIndex: 1 }}>
        {error && (
          <div style={{
            padding: 16, borderRadius: "var(--radius-sm)",
            background: "rgba(255, 107, 107, 0.1)", border: "1px solid rgba(255, 107, 107, 0.3)",
            color: "var(--danger)", marginBottom: 24, textAlign: "center", fontSize: 14,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          }}>
            <span>{error}</span>
            {error.includes("timed out") || error.includes("Failed to fetch") ? (
              <button
                onClick={handleRetry}
                style={{
                  background: "rgba(255, 107, 107, 0.2)", border: "1px solid rgba(255, 107, 107, 0.4)",
                  color: "var(--danger)", padding: "6px 16px", borderRadius: "var(--radius-xs)",
                  cursor: "pointer", fontWeight: 600, fontSize: 13,
                }}
              >
                ↻ Retry
              </button>
            ) : null}
          </div>
        )}

        {currentQuestion && (
          <div className="animate-fade-in">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <span style={{
                padding: "4px 12px", borderRadius: 12,
                background: "rgba(108, 92, 231, 0.1)", color: "var(--accent-secondary)",
                fontSize: 13, fontWeight: 600,
              }}>Question {currentIndex + 1} of {questions.length}</span>
              {wasSpoken && (
                <span style={{
                  padding: "4px 10px", borderRadius: 12,
                  background: "rgba(0, 206, 201, 0.1)", color: "var(--success)",
                  fontSize: 12, fontWeight: 500,
                }}>🎤 Spoken</span>
              )}
              {cameraOn && (
                <span style={{
                  padding: "4px 10px", borderRadius: 12,
                  background: "rgba(108, 92, 231, 0.1)", color: "var(--accent-secondary)",
                  fontSize: 12, fontWeight: 500,
                }}>📹 Camera On</span>
              )}
            </div>

            <div className="glass-card" style={{ padding: 32, marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.5 }}>{currentQuestion.question_text}</h2>
            </div>

            {!feedback && !isStreaming ? (
              <div>
                <textarea
                  id="answer-input"
                  className="input-field"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Type your answer here... or use the 🎤 Speak button to dictate."
                  rows={8}
                  style={{ marginBottom: 16, minHeight: 200 }}
                  disabled={isSubmitting}
                />

                {/* ─── Controls bar ─────────────────────────────── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{answer.length} characters</span>

                    {/* Speech toggle */}
                    {speechSupported && (
                      <button
                        onClick={toggleSpeech}
                        className={`speech-btn ${isSpeaking ? "speech-active" : ""}`}
                        disabled={isSubmitting}
                        title={isSpeaking ? "Stop recording" : "Speak your answer"}
                      >
                        {isSpeaking ? "⏹ Stop" : "🎤 Speak"}
                      </button>
                    )}
                  </div>

                  <button id="submit-answer-btn" className="btn-primary" onClick={handleSubmit} disabled={!answer.trim() || isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <span style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid white", borderTopColor: "transparent", animation: "spin-slow 0.8s linear infinite", display: "inline-block" }} />
                        Evaluating with AI...
                      </>
                    ) : "Submit Answer →"}
                  </button>
                </div>
              </div>
            ) : isStreaming && !feedback ? (
              /* ─── Streaming state: show live AI tokens ──────── */
              <div className="animate-fade-in">
                <div className="glass-card" style={{ padding: 32, marginBottom: 24, borderColor: "var(--accent-primary)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: "var(--accent-primary)",
                      animation: "pulse-glow 1.5s ease-in-out infinite",
                      display: "inline-block",
                    }} />
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--accent-secondary)" }}>AI is evaluating...</h3>
                  </div>
                  <div style={{
                    fontFamily: "monospace", fontSize: 13, color: "var(--text-secondary)",
                    lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-word",
                    maxHeight: 300, overflowY: "auto",
                    padding: 16, borderRadius: "var(--radius-sm)",
                    background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
                  }}>
                    {streamingText}
                    <span style={{
                      display: "inline-block", width: 8, height: 16,
                      background: "var(--accent-primary)", marginLeft: 2,
                      animation: "pulse-glow 1s ease-in-out infinite",
                    }} />
                  </div>
                </div>
              </div>
            ) : feedback ? (
              <div className="animate-slide-up">
                {/* ─── Main AI Feedback ──────────────────────────── */}
                <div className="glass-card" style={{ padding: 32, marginBottom: 24, borderColor: "var(--accent-primary)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 700 }}>AI Feedback</h3>
                    <span className={`score-badge ${scoreClass(feedback.score)}`} style={{ fontSize: 18, padding: "8px 20px" }}>
                      {feedback.score?.toFixed(1)} / 10
                    </span>
                  </div>
                  <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 20 }}>{feedback.ai_feedback}</p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                    <div style={{ padding: 16, borderRadius: "var(--radius-sm)", background: "rgba(0, 206, 201, 0.05)", border: "1px solid rgba(0, 206, 201, 0.15)" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--success)", marginBottom: 8 }}>✓ Strengths</div>
                      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>{feedback.strengths}</p>
                    </div>
                    <div style={{ padding: 16, borderRadius: "var(--radius-sm)", background: "rgba(255, 107, 107, 0.05)", border: "1px solid rgba(255, 107, 107, 0.15)" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)", marginBottom: 8 }}>✗ Areas to Improve</div>
                      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>{feedback.weaknesses}</p>
                    </div>
                  </div>

                  {feedback.improved_answer && (
                    <div style={{ padding: 16, borderRadius: "var(--radius-sm)", background: "rgba(108, 92, 231, 0.05)", border: "1px solid rgba(108, 92, 231, 0.15)" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-secondary)", marginBottom: 8 }}>💡 Model Answer</div>
                      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{feedback.improved_answer}</p>
                    </div>
                  )}
                </div>

                {/* ─── Speech Evaluation Feedback ───────────────── */}
                {speechFeedback && (
                  <div className="glass-card animate-fade-in" style={{ padding: 24, marginBottom: 24, borderColor: "rgba(0, 206, 201, 0.3)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                        🎤 Speech Analysis
                      </h3>
                      <span className={`score-badge ${scoreClass(speechFeedback.speech_score)}`} style={{ fontSize: 14, padding: "4px 14px" }}>
                        {speechFeedback.speech_score.toFixed(1)} / 10
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                      <div style={{ padding: 12, borderRadius: "var(--radius-xs)", background: "rgba(0, 206, 201, 0.04)", border: "1px solid rgba(0, 206, 201, 0.1)" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--success)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Clarity</div>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>{speechFeedback.clarity}</p>
                      </div>
                      <div style={{ padding: 12, borderRadius: "var(--radius-xs)", background: "rgba(108, 92, 231, 0.04)", border: "1px solid rgba(108, 92, 231, 0.1)" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-secondary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Structure</div>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>{speechFeedback.structure}</p>
                      </div>
                      <div style={{ padding: 12, borderRadius: "var(--radius-xs)", background: "rgba(253, 203, 110, 0.04)", border: "1px solid rgba(253, 203, 110, 0.1)" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--warning)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Confidence</div>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>{speechFeedback.confidence}</p>
                      </div>
                      <div style={{ padding: 12, borderRadius: "var(--radius-xs)", background: "rgba(255, 107, 107, 0.04)", border: "1px solid rgba(255, 107, 107, 0.1)" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--danger)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Filler Words</div>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>{speechFeedback.filler_words}</p>
                      </div>
                    </div>
                    <div style={{ padding: 12, borderRadius: "var(--radius-xs)", background: "rgba(0, 206, 201, 0.05)", border: "1px solid rgba(0, 206, 201, 0.12)" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--success)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>💬 Speaking Tips</div>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{speechFeedback.tips}</p>
                    </div>
                  </div>
                )}

                {/* ─── Camera/Posture Evaluation Feedback ─────── */}
                {postureFeedback && (
                  <div className="glass-card animate-fade-in" style={{ padding: 24, marginBottom: 24, borderColor: "rgba(108, 92, 231, 0.3)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                        📹 Presentation Coaching
                      </h3>
                      <span className={`score-badge ${scoreClass(postureFeedback.posture_score)}`} style={{ fontSize: 14, padding: "4px 14px" }}>
                        {postureFeedback.posture_score.toFixed(1)} / 10
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                      <div style={{ padding: 12, borderRadius: "var(--radius-xs)", background: "rgba(108, 92, 231, 0.04)", border: "1px solid rgba(108, 92, 231, 0.1)" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-secondary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>👁 Eye Contact</div>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>{postureFeedback.eye_contact}</p>
                      </div>
                      <div style={{ padding: 12, borderRadius: "var(--radius-xs)", background: "rgba(0, 206, 201, 0.04)", border: "1px solid rgba(0, 206, 201, 0.1)" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--success)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>🧍 Body Language</div>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>{postureFeedback.body_language}</p>
                      </div>
                      <div style={{ padding: 12, borderRadius: "var(--radius-xs)", background: "rgba(253, 203, 110, 0.04)", border: "1px solid rgba(253, 203, 110, 0.1)" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--warning)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>😊 Expression</div>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>{postureFeedback.expression}</p>
                      </div>
                    </div>
                    <div style={{ padding: 12, borderRadius: "var(--radius-xs)", background: "rgba(108, 92, 231, 0.05)", border: "1px solid rgba(108, 92, 231, 0.12)" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-secondary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>🎯 Presentation Tips</div>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{postureFeedback.presentation_tips}</p>
                    </div>
                  </div>
                )}

                {/* ─── Camera preview replay in feedback ──────── */}
                {cameraOn && (
                  <div className="glass-card" style={{ padding: 20, marginBottom: 24, textAlign: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-secondary)", marginBottom: 12 }}>📹 Your Camera Preview</div>
                    <div style={{
                      width: 160, height: 160, borderRadius: "50%", overflow: "hidden",
                      margin: "0 auto", border: "2px solid var(--accent-primary)",
                      boxShadow: "0 0 20px var(--accent-glow)",
                    }}>
                      <video
                        autoPlay
                        playsInline
                        muted
                        ref={(el) => {
                          if (el && streamRef.current) el.srcObject = streamRef.current;
                        }}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                      Review your body language and expressions
                    </p>
                  </div>
                )}

                {/* ─── Loading indicators for background evaluations ─ */}
                {(wasSpoken && !speechFeedback) || (cameraOn && !postureFeedback) ? (
                  <div style={{ textAlign: "center", marginBottom: 20 }}>
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      padding: "8px 16px", borderRadius: "var(--radius-xs)",
                      background: "var(--bg-secondary)", fontSize: 13, color: "var(--text-muted)",
                    }}>
                      <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--accent-primary)", borderTopColor: "transparent", animation: "spin-slow 0.8s linear infinite", display: "inline-block" }} />
                      {wasSpoken && !speechFeedback && cameraOn && !postureFeedback
                        ? "Loading speech & posture analysis..."
                        : wasSpoken && !speechFeedback
                        ? "Loading speech analysis..."
                        : "Loading presentation coaching..."}
                    </div>
                  </div>
                ) : null}

                <div style={{ textAlign: "center" }}>
                  <button className="btn-primary" onClick={handleNext} style={{ fontSize: 16, padding: "16px 40px" }}>
                    {currentIndex < questions.length - 1 ? "Next Question →" : "🏁 View Results"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </main>

      {/* ─── Abort Confirmation Modal ───────────────────────── */}
      {showAbortConfirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 999,
          background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowAbortConfirm(false)}>
          <div className="glass-card animate-slide-up" style={{
            padding: 32, maxWidth: 420, width: "90%", textAlign: "center",
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Abort Interview?</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
              Are you sure you want to quit? Your progress on unanswered questions will not be saved.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                onClick={() => setShowAbortConfirm(false)}
                style={{
                  padding: "10px 24px", borderRadius: "var(--radius-xs)",
                  background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
                  color: "var(--text-primary)", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                Continue Test
              </button>
              <button
                onClick={() => {
                  if (streamRef.current) {
                    streamRef.current.getTracks().forEach((t) => t.stop());
                    streamRef.current = null;
                  }
                  if (recognitionRef.current) {
                    recognitionRef.current.stop();
                  }
                  router.push("/dashboard");
                }}
                style={{
                  padding: "10px 24px", borderRadius: "var(--radius-xs)",
                  background: "rgba(255, 107, 107, 0.2)", border: "1px solid rgba(255, 107, 107, 0.4)",
                  color: "var(--danger)", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                Yes, Abort
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
