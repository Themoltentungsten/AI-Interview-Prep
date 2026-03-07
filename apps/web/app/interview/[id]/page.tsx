"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import "../style.css";
import { useParams, useRouter } from "next/navigation";
import { useSpeechToText } from "@/hooks/useSpeechHook";
import { getSocket } from "@/ws-client-config/socket";
import { useInterviewStore } from "@/store/useInterviewStore";

// ─────────────────────────────────────────────────────────
// Timer hook
// ─────────────────────────────────────────────────────────
function useTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ─────────────────────────────────────────────────────────
// Wave bars
// ─────────────────────────────────────────────────────────
function WaveBars({ active }: { active: boolean }) {
  return (
    <div className={`wave-bars${active ? " wave-active" : ""}`}>
      {[...Array(5)].map((_, i) => (
        <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main Interview Page
// ─────────────────────────────────────────────────────────
export default function InterviewPage() {
  const router = useRouter();
  const params = useParams();
  const interviewId = params.id as string;

  // ── UI state ──────────────────────────────────────────
  const [input, setInput] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [sessionRunning, setSessionRunning] = useState(true);
  const [isEnding, setIsEnding] = useState(false);

  // ── Refs ──────────────────────────────────────────────
  const chatEndRef = useRef<HTMLDivElement>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const aiAudioRef = useRef<HTMLAudioElement>(null);
  const userStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isRecordingRef = useRef(false);
  // AudioContext only allows createMediaElementSource once per element
  const aiSourceCreatedRef = useRef(false);

  // ── Media permissions ─────────────────────────────────
  const [micPermission, setMicPermission] = useState(false);
  const [camPermission, setCamPermission] = useState(false);

  const timer = useTimer(sessionRunning);

  // ─────────────────────────────────────────────────────
  // Zustand store — single source of truth for messages
  // ─────────────────────────────────────────────────────
  const { currentQuestion, clearCurrentQuestion, addMessage, messages, reset } = useInterviewStore();

  // ─────────────────────────────────────────────────────
  // endSession — single function for ALL end paths:
  //   1. User clicks End button
  //   2. Backend fires interview:complete
  // Stops recording → triggers file download → redirects
  // ─────────────────────────────────────────────────────
  const endSession = useCallback((fromBackend = false) => {
    if (isEnding) return;
    setIsEnding(true);
    setSessionRunning(false);
    setAiSpeaking(false);

    // Stop recording — onstop handler saves the file
    if (isRecordingRef.current && recorderRef.current) {
      recorderRef.current.stop();
      isRecordingRef.current = false;
    }

    // Close AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // If user ended manually, notify backend to finalize early
    if (!fromBackend) {
      const socket = getSocket();
      // Store an empty answer so wait_for_answer exits immediately
      socket.emit("submit_answer", { interviewId, answer: "__END__" });
    }

    // Persist interview results to Neon (fire and forget)
    // fromBackend=true means finalize() already ran and summary is in Redis
    // fromBackend=false means we triggered early via __END__, give Python 2s to finalize
    const persistDelay = fromBackend ? 0 : 2000;
    setTimeout(() => {
      fetch(`http://localhost:4000/api/interview/${interviewId}/complete`, {
        method: "POST",
        credentials: "include",
      }).catch((err) => console.error("[persist] Failed to save to Neon:", err));
    }, persistDelay);

    // Delay redirect so onstop (file save) fires first
    setTimeout(() => {
      reset();
      router.push(`/feedback/${interviewId}/`);
    }, 1000);
  }, [isEnding, interviewId, router, reset]);

  // ─────────────────────────────────────────────────────
  // playAIAudio — fetches TTS, plays through audio element
  // The audio element is wired to AudioContext so it gets
  // captured in the recording automatically
  // ─────────────────────────────────────────────────────
  const playAIAudio = useCallback(async (text: string) => {
    if (!aiAudioRef.current) return;
    try {
      setAiSpeaking(true);
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "alloy" }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      aiAudioRef.current.src = url;
      await aiAudioRef.current.play();
      aiAudioRef.current.onended = () => {
        setAiSpeaking(false);
        URL.revokeObjectURL(url);
      };
    } catch (err) {
      console.error("[TTS] Failed:", err);
      setAiSpeaking(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────
  // handleQuestion — appends to transcript + plays AI voice
  // ─────────────────────────────────────────────────────
  const handleQuestion = useCallback((data: { question: string; time?: number }) => {
    console.log("[interview] question:", data.question);
    const now = data.time
      ? new Date(data.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    addMessage({ id: Date.now(), role: "ai", text: data.question, time: now });
    playAIAudio(data.question);
  }, [addMessage, playAIAudio]);

  // ─────────────────────────────────────────────────────
  // Speech-to-text — fires when user stops speaking:
  // 1. Append to transcript
  // 2. Auto-submit to backend (no button press needed)
  // ─────────────────────────────────────────────────────
  const { transcript, startListening, stopListening } =
    useSpeechToText((finalText) => {
      if (!finalText.trim()) return;
      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      addMessage({ id: Date.now(), role: "user", text: finalText, time: now });
      setInput("");
      const socket = getSocket();
      socket.emit("submit_answer", { interviewId, answer: finalText });
      setAiSpeaking(true); // typing indicator while backend processes
    });

  // ─────────────────────────────────────────────────────
  // Socket setup
  // ─────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    socket.emit("join_interview", { interviewId });

    // Replay first question stored in waiting room
    if (currentQuestion) {
      handleQuestion(currentQuestion);
      clearCurrentQuestion();
    }

    socket.on("interview:question", handleQuestion);

    // Backend finished all questions → end session
    socket.on("interview:complete", () => {
      endSession(true);
    });

    return () => {
      socket.off("interview:question");
      socket.off("interview:complete");
    };
  }, [interviewId, handleQuestion]);

  // ─────────────────────────────────────────────────────
  // Stable mic refs
  // ─────────────────────────────────────────────────────
  const startListeningRef = useRef(startListening);
  const stopListeningRef = useRef(stopListening);
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);
  useEffect(() => { stopListeningRef.current = stopListening; }, [stopListening]);

  // ─────────────────────────────────────────────────────
  // getUserMedia
  // ─────────────────────────────────────────────────────
  useEffect(() => {
    const requestMediaAccess = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: true,
        });
        userStreamRef.current = stream;
        setMicPermission(true);
        setCamPermission(true);
      } catch (err) {
        console.error("[interview] Media denied:", err);
      }
    };
    requestMediaAccess();
    return () => {
      userStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Attach camera to video element
  useEffect(() => {
    if (userVideoRef.current && userStreamRef.current) {
      userVideoRef.current.srcObject = userStreamRef.current;
    }
  }, [micPermission, camOn]);

  // Mirror transcript to input box
  useEffect(() => {
    if (transcript) setInput(transcript);
  }, [transcript]);

  // Pause mic while AI is speaking (prevents feedback loop)
  useEffect(() => {
    if (micOn && !aiSpeaking) {
      startListeningRef.current();
    } else {
      stopListeningRef.current();
    }
    return () => { stopListeningRef.current(); };
  }, [micOn, aiSpeaking]);

  // ─────────────────────────────────────────────────────
  // startRecording — records ONE mixed stream:
  //
  //   Video:  user webcam
  //   Audio:  user mic + AI TTS (both voices in one track)
  //
  // How AI voice gets into the recording:
  //   aiAudioRef.current → createMediaElementSource
  //     → connect to mixedDest   (captured in webm)
  //     → connect to destination (heard in speakers)
  //
  // File saved to Downloads as:
  //   interview-{interviewId}-{timestamp}.webm
  // ─────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!userStreamRef.current || isRecordingRef.current) return;
    try {
      isRecordingRef.current = true;
      const stream = userStreamRef.current;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const mixedDest = audioContext.createMediaStreamDestination();

      // User mic → mixed output
      const micSource = audioContext.createMediaStreamSource(stream);
      micSource.connect(mixedDest);

      // AI audio → mixed output AND speakers
      // Only created once due to AudioContext limitation
      if (aiAudioRef.current && !aiSourceCreatedRef.current) {
        const aiSource = audioContext.createMediaElementSource(aiAudioRef.current);
        aiSource.connect(mixedDest);               // → recording
        aiSource.connect(audioContext.destination); // → speakers
        aiSourceCreatedRef.current = true;
      }

      // Final stream: user video + mixed audio (user + AI)
      const mixedStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...mixedDest.stream.getAudioTracks(),
      ]);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";

      const recorder = new MediaRecorder(mixedStream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      // Triggered when recorder.stop() is called (from endSession)
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const formData = new FormData();
        formData.append("file", blob, "recording.webm");
        formData.append("interviewId", interviewId);

        await fetch("/api/save-recording", { method: "POST", body: formData });
        console.log("[recording] Saved to apps/web/recordings/");
      };

      recorder.start(1000); // 1s chunks for reliability
      console.log("[recording] Started — user video + user mic + AI audio");
    } catch (err) {
      console.error("[recording] Failed:", err);
      isRecordingRef.current = false;
    }
  }, [interviewId]);

  useEffect(() => {
    if (micPermission && camPermission && !isRecordingRef.current) {
      startRecording();
    }
  }, [micPermission, camPermission, startRecording]);

  // Auto-scroll transcript
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─────────────────────────────────────────────────────
  // sendMessage — manual fallback (user types instead of speaks)
  // ─────────────────────────────────────────────────────
  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;
    addMessage({
      id: Date.now(),
      role: "user",
      text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
    setInput("");
    const socket = getSocket();
    socket.emit("submit_answer", { interviewId, answer: text });
    setAiSpeaking(true);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      <div className="noise" />
      <div className="interview-root">

        {/* ════ TOP BAR ════ */}
        <header className="interview-topbar">
          <div className="topbar-left">
            <Link href="/dashboard" className="topbar-logo">
              Interview<span>AI</span>
            </Link>
            <div className="topbar-divider" />
            <div className="topbar-session-info">
              <span className="tag tag-accent">System Design</span>
              <span className="topbar-title">URL Shortener</span>
            </div>
          </div>

          <div className="topbar-center">
            <div className={`live-chip${aiSpeaking ? " ai-pulse" : ""}`}>
              <span className="dot-live" />
              LIVE
            </div>
            <div className="timer-block">
              <span className="timer">{timer}</span>
            </div>
          </div>

          <div className="topbar-right">
            <div className="score-preview">
              <span className="score-preview-label">Score</span>
              <span className="score-preview-value score-high">78</span>
            </div>
            <button
              className="btn-end-session"
              onClick={() => endSession(false)}
              disabled={isEnding}
            >
              {isEnding ? "Ending…" : "End Session"}
            </button>
          </div>
        </header>

        {/* ════ BODY ════ */}
        <div className="interview-body">

          {/* ── Video area ── */}
          <div className="video-area">

            <div className={`vid-card vid-ai${aiSpeaking ? " speaking" : ""}`}>
              <div className="vid-inner">
                <div className="vid-placeholder vid-placeholder-ai">
                  <div className="vid-avatar-ring">
                    <div className="vid-avatar">
                      {/* Connected to AudioContext for recording AI voice */}
                      <audio ref={aiAudioRef} />
                    </div>
                  </div>
                  <div className="vid-circuit">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="circuit-line" style={{ animationDelay: `${i * 0.4}s` }} />
                    ))}
                  </div>
                </div>
                <div className="vid-speaking-bar">
                  <WaveBars active={aiSpeaking} />
                  <span className="vid-speaking-label">
                    {aiSpeaking ? "AI is speaking…" : "Listening"}
                  </span>
                </div>
              </div>
              <div className="vid-nametag">
                <span className="dot-accent-static" />
                <span className="vid-name">PrepAI Interviewer</span>
                <span className="tag tag-violet">GPT-o3</span>
              </div>
            </div>

            <div className={`vid-card vid-user${!camOn ? " cam-off" : ""}`}>
              <div className="vid-inner">
                {camOn && micPermission ? (
                  <div className="vid-placeholder vid-placeholder-user">
                    <div className="vid-avatar-user">
                      <video ref={userVideoRef} autoPlay muted playsInline />
                    </div>
                    {[...Array(8)].map((_, i) => (
                      <div
                        key={i}
                        className="bokeh"
                        style={{
                          left: `${10 + i * 11}%`,
                          top: `${20 + (i % 3) * 25}%`,
                          animationDelay: `${i * 0.3}s`,
                          zIndex: 0,
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="cam-off-state h-full! flex! items-center justify-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                      <path d="M3 3l18 18M10.5 10.5A2 2 0 0013.5 13.5M9 5h7l2 2h3v12H9m-5-5V7h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <span>Camera off</span>
                  </div>
                )}
              </div>
              <div className="vid-nametag">
                <span className="dot-accent-static dot-user" />
                <span className="vid-name">Alex Rivera</span>
                <span className="tag tag-sky">You</span>
              </div>
            </div>

            {/* ── Controls bar ── */}
            <div className="controls-bar">
              <button
                className={`ctrl-btn${!micOn ? " ctrl-off" : ""}`}
                onClick={() => setMicOn((prev) => !prev)}
                title={micOn ? "Mute mic" : "Unmute mic"}
              >
                {micOn ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M3 3l18 18M9 9v5a3 3 0 005.12 2.12M15 9.34V5a3 3 0 00-5.94-.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M17 16.95A7 7 0 015 10M12 19v3M9 22h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                )}
                <span>{micOn ? "Mute" : "Unmute"}</span>
              </button>

              <button
                className={`ctrl-btn${!camOn ? " ctrl-off" : ""}`}
                onClick={() => setCamOn((v) => !v)}
                title={camOn ? "Stop camera" : "Start camera"}
              >
                {camOn ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M3 3l18 18M10.5 8.5H13a2 2 0 012 2v.5m1 4.47V16a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h.5M15 10l4.553-2.276A1 1 0 0121 8.723v6.554" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                )}
                <span>{camOn ? "Camera" : "No cam"}</span>
              </button>

              <button
                className="ctrl-btn ctrl-btn-end"
                onClick={() => endSession(false)}
                disabled={isEnding}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M6.827 6.175A8 8 0 0117.173 17.173M12 6v6l4 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M3.05 11a9 9 0 1017.9 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span>End</span>
              </button>
            </div>
          </div>

          {/* ── Chat panel ── */}
          <aside className="chat-panel">
            <div className="chat-header">
              <div className="chat-header-left">
                <span className="chat-icon">◎</span>
                <span className="chat-title">Transcript</span>
              </div>
              <span className="chat-count">{messages.length} msgs</span>
            </div>

            <div className="chat-messages">
              {messages.map((m, i) => (
                <div
                  key={m.id}
                  className={`chat-msg chat-msg-${m.role}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {m.role === "ai" && (
                    <div className="chat-msg-avatar chat-msg-avatar-ai">AI</div>
                  )}
                  <div className="chat-msg-body">
                    <div className="chat-bubble">{m.text}</div>
                    <div className="chat-time">{m.time}</div>
                  </div>
                  {m.role === "user" && (
                    <div className="chat-msg-avatar chat-msg-avatar-user">AR</div>
                  )}
                </div>
              ))}

              {aiSpeaking && (
                <div className="chat-msg chat-msg-ai">
                  <div className="chat-msg-avatar chat-msg-avatar-ai">AI</div>
                  <div className="chat-msg-body">
                    <div className="chat-bubble chat-bubble-typing">
                      <span className="typing-dot" style={{ animationDelay: "0s" }} />
                      <span className="typing-dot" style={{ animationDelay: "0.18s" }} />
                      <span className="typing-dot" style={{ animationDelay: "0.36s" }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            <div className="chat-input-wrap">
              <textarea
                className="chat-input"
                rows={1}
                placeholder="Type a response or note…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
              />
              <button
                className="chat-send-btn"
                onClick={sendMessage}
                disabled={!input.trim()}
                aria-label="Send"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}