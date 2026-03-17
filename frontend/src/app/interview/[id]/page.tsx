"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { getQuestions, submitAnswer, evaluateSpeech, isAuthenticated } from "@/services/api";

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

interface SpeechEvalResult {
  confidence: number;
  clarity: number;
  feedback: string;
  strengths: string;
  weaknesses: string;
  posture_score?: number;
  posture_feedback?: string;
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
  const [answeredCount, setAnsweredCount] = useState(0);
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ─── Abort confirmation ────────────────────────────────────
  const [showAbortModal, setShowAbortModal] = useState(false);

  // ─── Webcam state ──────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

  // ─── Speech state ──────────────────────────────────────────
  const recognitionRef = useRef<any>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  // ─── Speech + Posture Evaluation state ─────────────────────
  const [speechEval, setSpeechEval] = useState<SpeechEvalResult | null>(null);
  const [isEvaluatingSpeech, setIsEvaluatingSpeech] = useState(false);

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

  // Check speech support
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(!!SpeechRecognition);
  }, []);

  // Timer
  useEffect(() => {
    if (!timerActive) return;
    const interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [timerActive]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // ─── Webcam controls ──────────────────────────────────────
  const toggleCamera = async () => {
    if (cameraOn) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setCameraOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraOn(true);
      } catch (err) {
        console.error("Camera access denied:", err);
        setError("Camera access denied. Please allow camera permissions.");
      }
    }
  };

  // ─── Capture webcam snapshot & analyze posture ─────────────
  const capturePostureDescription = (): string => {
    if (!cameraOn || !videoRef.current || !canvasRef.current) {
      return "";
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Analyze the frame for basic visual cues
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Calculate average brightness
    let totalBrightness = 0;
    const pixelCount = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    const avgBrightness = totalBrightness / pixelCount;

    // Check center region for face presence (center 40% of frame)
    const cx = Math.floor(canvas.width * 0.3);
    const cy = Math.floor(canvas.height * 0.2);
    const cw = Math.floor(canvas.width * 0.4);
    const ch = Math.floor(canvas.height * 0.5);

    let centerBrightness = 0;
    let centerPixels = 0;
    let skinTonePixels = 0;

    for (let y = cy; y < cy + ch; y++) {
      for (let x = cx; x < cx + cw; x++) {
        const idx = (y * canvas.width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        centerBrightness += (r + g + b) / 3;
        centerPixels++;
        // Simple skin tone detection (rough heuristic)
        if (r > 80 && g > 50 && b > 30 && r > g && r > b && Math.abs(r - g) > 15) {
          skinTonePixels++;
        }
      }
    }

    const avgCenterBrightness = centerPixels > 0 ? centerBrightness / centerPixels : 0;
    const skinToneRatio = centerPixels > 0 ? skinTonePixels / centerPixels : 0;

    // Build description
    const parts: string[] = [];

    // Lighting assessment
    if (avgBrightness < 60) parts.push("The lighting is very dim/dark");
    else if (avgBrightness < 100) parts.push("The lighting is somewhat dim");
    else if (avgBrightness > 200) parts.push("The lighting is very bright/overexposed");
    else parts.push("The lighting appears adequate");

    // Face/person presence
    if (skinToneRatio > 0.15) {
      parts.push("The candidate appears to be well-centered and visible in the frame");
      if (skinToneRatio > 0.4) parts.push("The candidate is very close to the camera");
    } else if (skinToneRatio > 0.05) {
      parts.push("The candidate is partially visible but may not be well-centered");
    } else {
      parts.push("The candidate may not be visible or is looking away from the camera");
    }

    // Center vs edge: check if person is centered
    if (avgCenterBrightness > avgBrightness * 1.1) {
      parts.push("The subject appears to be centered in the frame (good framing)");
    }

    return parts.join(". ") + ".";
  };

  // ─── Speech controls ──────────────────────────────────────
  const toggleSpeech = () => {
    if (isSpeaking) {
      stopSpeech();
    } else {
      startSpeech();
    }
  };

  const startSpeech = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = answer;

    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? " " : "") + transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      setAnswer(finalTranscript + (interimTranscript ? " " + interimTranscript : ""));
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
  };

  const stopSpeech = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsSpeaking(false);
  };

  // ─── Submit answer ────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!answer.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      const result = await submitAnswer(questions[currentIndex].id, answer);
      setFeedback({
        score: result.score,
        ai_feedback: result.ai_feedback,
        strengths: result.strengths,
        weaknesses: result.weaknesses,
        improved_answer: result.improved_answer,
      });
      setAnsweredCount((c) => c + 1);
      setTimerActive(false);
      stopSpeech();
    } catch (err: any) {
      setError(err.message || "Failed to submit answer");
    }
    setIsSubmitting(false);
  }, [answer, isSubmitting, questions, currentIndex]);

  // ─── Speech + Posture evaluation ──────────────────────────
  const handleEvaluateSpeech = async () => {
    if (!answer.trim()) return;
    setIsEvaluatingSpeech(true);
    setSpeechEval(null);

    // Capture posture description from webcam if camera is on
    const postureDesc = capturePostureDescription();

    try {
      const result = await evaluateSpeech(
        questions[currentIndex].question_text,
        answer,
        postureDesc
      );
      setSpeechEval(result);
    } catch (err: any) {
      setError(err.message || "Speech evaluation failed");
    }
    setIsEvaluatingSpeech(false);
  };

  // ─── Next question ────────────────────────────────────────
  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setAnswer("");
      setFeedback(null);
      setSpeechEval(null);
      setTimer(0);
      setTimerActive(true);
    } else {
      router.push(`/interview/${interviewId}/results`);
    }
  };

  // ─── Abort test ────────────────────────────────────────────
  const handleAbort = () => {
    stopSpeech();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    router.push("/dashboard");
  };

  const scoreClass = (score: number | null) => {
    if (!score) return "";
    if (score >= 7) return "score-high";
    if (score >= 4) return "score-mid";
    return "score-low";
  };

  const evalScoreColor = (score: number) => {
    if (score >= 7) return "var(--success)";
    if (score >= 4) return "var(--warning)";
    return "var(--danger)";
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

      {/* Hidden canvas for webcam snapshot analysis */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* ─── Webcam PiP ──────────────────────────────────── */}
      <div className="webcam-container">
        {cameraOn ? (
          <video ref={videoRef} autoPlay muted playsInline />
        ) : (
          <div className="webcam-off-placeholder">📹</div>
        )}
        <button className="webcam-toggle" onClick={toggleCamera} title={cameraOn ? "Turn off camera" : "Turn on camera"}>
          {cameraOn ? "✕" : "📹"}
        </button>
      </div>

      {/* ─── Abort Confirmation Modal ────────────────────── */}
      {showAbortModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
          backdropFilter: "blur(4px)",
        }}>
          <div className="glass-card" style={{
            padding: 40, maxWidth: 420, width: "90%", textAlign: "center",
            animation: "fadeIn 0.2s ease-out",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Abort Interview?</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
              Your progress on unanswered questions will be lost. Answered questions are already saved.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                className="btn-secondary"
                onClick={() => setShowAbortModal(false)}
                style={{ padding: "12px 28px" }}
              >
                Continue Interview
              </button>
              <button
                onClick={handleAbort}
                style={{
                  background: "rgba(255, 107, 107, 0.15)", border: "1px solid rgba(255, 107, 107, 0.4)",
                  color: "var(--danger)", padding: "12px 28px", borderRadius: "var(--radius-sm)",
                  fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.2s",
                }}
              >
                ✕ Abort Test
              </button>
            </div>
          </div>
        </div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {isSpeaking && (
            <div className="recording-indicator">
              <div className="rec-dot" />
              Recording...
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {questions.map((_, i) => (
              <div key={i} style={{
                width: i === currentIndex ? 24 : 10, height: 10, borderRadius: 5,
                background: i < answeredCount ? "var(--success)" : i === currentIndex ? "var(--accent-primary)" : "var(--border-color)",
                transition: "all 0.3s ease",
              }} />
            ))}
          </div>
          <div style={{
            fontFamily: "monospace", fontSize: 18, fontWeight: 600,
            color: timer > 300 ? "var(--danger)" : "var(--text-secondary)",
            padding: "6px 14px", borderRadius: "var(--radius-xs)", background: "var(--bg-secondary)",
          }}>⏱ {formatTime(timer)}</div>
          {/* Abort button */}
          <button
            onClick={() => setShowAbortModal(true)}
            title="Abort interview"
            style={{
              background: "transparent", border: "1px solid rgba(255, 107, 107, 0.3)",
              color: "var(--danger)", padding: "6px 16px", borderRadius: "var(--radius-xs)",
              fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "rgba(255, 107, 107, 0.1)"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
          >
            ✕ Abort
          </button>
        </div>
      </nav>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px", position: "relative", zIndex: 1 }}>
        {error && (
          <div style={{
            padding: 16, borderRadius: "var(--radius-sm)",
            background: "rgba(255, 107, 107, 0.1)", border: "1px solid rgba(255, 107, 107, 0.3)",
            color: "var(--danger)", marginBottom: 24, textAlign: "center", fontSize: 14,
          }}>{error}</div>
        )}

        {currentQuestion && (
          <div className="animate-fade-in">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <span style={{
                padding: "4px 12px", borderRadius: 12,
                background: "rgba(108, 92, 231, 0.1)", color: "var(--accent-secondary)",
                fontSize: 13, fontWeight: 600,
              }}>Question {currentIndex + 1} of {questions.length}</span>
              {cameraOn && (
                <span style={{
                  padding: "4px 12px", borderRadius: 12,
                  background: "rgba(0, 206, 201, 0.1)", color: "var(--success)",
                  fontSize: 12, fontWeight: 500,
                }}>📹 Camera active — posture will be assessed</span>
              )}
            </div>

            <div className="glass-card" style={{ padding: 32, marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.5 }}>{currentQuestion.question_text}</h2>
            </div>

            {!feedback ? (
              <div>
                <textarea
                  id="answer-input"
                  className="input-field"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={isSpeaking ? "🎤 Listening... speak your answer" : "Type your answer here... or use the microphone to speak."}
                  rows={8}
                  style={{ marginBottom: 16, minHeight: 200 }}
                  disabled={isSubmitting}
                />

                {/* ─── Action buttons row ─────────────────── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{answer.length} characters</span>
                    {speechSupported && (
                      <button
                        className={`speech-btn ${isSpeaking ? "recording" : ""}`}
                        onClick={toggleSpeech}
                        type="button"
                      >
                        {isSpeaking ? "⏹ Stop" : "🎤 Speak"}
                      </button>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {answer.trim() && (
                      <button
                        className="btn-secondary"
                        onClick={handleEvaluateSpeech}
                        disabled={isEvaluatingSpeech || !answer.trim()}
                        style={{ padding: "12px 24px" }}
                        type="button"
                      >
                        {isEvaluatingSpeech ? (
                          <>
                            <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--text-secondary)", borderTopColor: "transparent", animation: "spin-slow 0.8s linear infinite", display: "inline-block" }} />
                            Evaluating...
                          </>
                        ) : cameraOn ? "🔍 Evaluate Speech + Posture" : "🔍 Evaluate Speech"}
                      </button>
                    )}
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

                {/* ─── Speech + Posture Evaluation Results ── */}
                {speechEval && (
                  <div className="speech-eval-card">
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                      🔍 {speechEval.posture_score != null ? "Speech & Posture Evaluation" : "Speech Evaluation"}
                    </h3>

                    <div className="eval-score-row">
                      <div className="eval-score-item">
                        <div className="score-value" style={{ color: evalScoreColor(speechEval.confidence) }}>
                          {speechEval.confidence}
                        </div>
                        <div className="score-label">Confidence</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>/ 10</div>
                      </div>
                      <div className="eval-score-item">
                        <div className="score-value" style={{ color: evalScoreColor(speechEval.clarity) }}>
                          {speechEval.clarity}
                        </div>
                        <div className="score-label">Clarity</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>/ 10</div>
                      </div>
                      {speechEval.posture_score != null && (
                        <div className="eval-score-item">
                          <div className="score-value" style={{ color: evalScoreColor(speechEval.posture_score) }}>
                            {speechEval.posture_score}
                          </div>
                          <div className="score-label">Posture</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>/ 10</div>
                        </div>
                      )}
                    </div>

                    <div style={{
                      padding: 16, borderRadius: "var(--radius-sm)",
                      background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-secondary)", marginBottom: 8 }}>💬 Feedback</div>
                      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{speechEval.feedback}</p>
                    </div>

                    {speechEval.posture_feedback && (
                      <div style={{
                        padding: 12, borderRadius: "var(--radius-xs)", marginTop: 12,
                        background: "rgba(108, 92, 231, 0.05)", border: "1px solid rgba(108, 92, 231, 0.15)",
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-secondary)" }}>📹 Posture: </span>
                        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{speechEval.posture_feedback}</span>
                      </div>
                    )}

                    {speechEval.strengths && (
                      <div style={{
                        padding: 12, borderRadius: "var(--radius-xs)", marginTop: 8,
                        background: "rgba(0, 206, 201, 0.05)", border: "1px solid rgba(0, 206, 201, 0.15)",
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--success)" }}>✓ Strengths: </span>
                        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{speechEval.strengths}</span>
                      </div>
                    )}
                    {speechEval.weaknesses && (
                      <div style={{
                        padding: 12, borderRadius: "var(--radius-xs)", marginTop: 8,
                        background: "rgba(255, 107, 107, 0.05)", border: "1px solid rgba(255, 107, 107, 0.15)",
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--danger)" }}>✗ Improve: </span>
                        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{speechEval.weaknesses}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="animate-slide-up">
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

                <div style={{ textAlign: "center" }}>
                  <button className="btn-primary" onClick={handleNext} style={{ fontSize: 16, padding: "16px 40px" }}>
                    {currentIndex < questions.length - 1 ? "Next Question →" : "🏁 View Results"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
