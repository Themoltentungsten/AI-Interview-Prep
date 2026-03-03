"use client";

import { useState } from "react";

type InterviewType = "TECHNICAL" | "HR" | "SYSTEM_DESIGN" | "BEHAVIORAL";
type Difficulty = "EASY" | "MEDIUM" | "HARD";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const INTERVIEW_TYPES: { value: InterviewType; label: string; icon: string; desc: string }[] = [
  { value: "TECHNICAL", label: "Technical", icon: "◈", desc: "DSA, coding, algorithms" },
  { value: "SYSTEM_DESIGN", label: "System Design", icon: "⬡", desc: "Architecture & scalability" },
  { value: "BEHAVIORAL", label: "Behavioral", icon: "◎", desc: "STAR-method, culture fit" },
  { value: "HR", label: "HR Round", icon: "◉", desc: "Salary, career, soft skills" },
];

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: "EASY", label: "Easy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HARD", label: "Hard" },
];

const TOPIC_SUGGESTIONS: Record<InterviewType, string[]> = {
  TECHNICAL: [
    "Arrays", "Strings", "Two Pointers", "Sliding Window",
    "Linked Lists", "Binary Trees", "Binary Search Trees", "Tries",
    "Graphs", "BFS", "DFS", "Topological Sort", "Union Find",
    "Dynamic Programming", "Recursion", "Backtracking", "Memoization",
    "Sorting", "Binary Search", "Hash Maps", "Heaps", "Stacks", "Queues",
    "Bit Manipulation", "Greedy", "Intervals", "Monotonic Stack",
  ],
  SYSTEM_DESIGN: [
    "URL Shortener", "Rate Limiter", "Chat App", "News Feed",
    "Notification Service", "Search Autocomplete", "Pastebin",
    "Load Balancer", "CDN", "Caching", "Distributed Cache",
    "SQL vs NoSQL", "Database Sharding", "Replication",
    "Twitter Clone", "YouTube", "Uber / Ride Sharing",
    "Google Drive", "Payment System", "E-commerce Platform",
    "API Gateway", "Message Queue", "Microservices vs Monolith",
    "CAP Theorem", "Consistent Hashing", "Event-Driven Architecture",
  ],
  BEHAVIORAL: [
    "Leadership", "Taking Initiative", "Ownership & Accountability",
    "Mentoring Others", "Conflict Resolution", "Disagreeing with a Manager",
    "Cross-team Collaboration", "Dealing with Difficult Teammates",
    "Failure & Learnings", "Handling Ambiguity", "Adaptability",
    "Working Under Pressure", "Meeting a Tight Deadline",
    "Biggest Achievement", "Going Beyond Your Role", "Improving a Process",
    "Teamwork", "Giving Feedback", "Receiving Feedback",
  ],
  HR: [
    "Why This Company", "Why This Role", "Career Goals",
    "Where Do You See Yourself in 5 Years", "Company Culture",
    "Strengths", "Weaknesses", "What Makes You Unique",
    "How Do You Handle Criticism", "Work Style",
    "Salary Negotiation", "Notice Period", "Relocation",
    "Work-Life Balance", "Remote vs On-site Preference",
    "How Do You Prioritize Tasks", "Handling Multiple Deadlines",
    "How Do You Stay Updated in Your Field",
  ],
};

export default function CustomSessionModal({ isOpen, onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<InterviewType | "">("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [questionCount, setQuestionCount] = useState(5);
  const [topics, setTopics] = useState<string[]>([]);
  const [customTopic, setCustomTopic] = useState("");
  const [description, setDescription] = useState("");
  const [jdText, setJdText] = useState("");
  const [jdParsing, setJdParsing] = useState(false);
  const [jdTopics, setJdTopics] = useState<string[]>([]);

  if (!isOpen) return null;

  const toggleTopic = (t: string) =>
    setTopics((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);

  const addCustomTopic = () => {
    const trimmed = customTopic.trim();
    if (trimmed && !topics.includes(trimmed)) {
      setTopics((prev) => [...prev, trimmed]);
    }
    setCustomTopic("");
  };

  const removeCustomTopic = (t: string) =>
    setTopics((prev) => prev.filter((x) => x !== t));

  // Call Claude API to extract topics from JD
  const parseJD = async () => {
    if (!jdText.trim()) return;
    setJdParsing(true);
    setJdTopics([]);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `You are an interview prep assistant. Given the job description below, extract the most relevant technical and non-technical interview topics a candidate should prepare for. Return ONLY a JSON array of short topic strings (max 3 words each), no explanation, no markdown, no backticks. Max 15 topics.

Job Description:
${jdText}`,
          }],
        }),
      });
      const data = await res.json();
      const text = data.content?.map((c: any) => c.text || "").join("") ?? "";
      const cleaned = text.replace(/```json|```/g, "").trim();
      const parsed: string[] = JSON.parse(cleaned);
      setJdTopics(parsed);
      // Auto-select parsed topics
      setTopics((prev) => Array.from(new Set([...prev, ...parsed])));
    } catch (err) {
      console.error("JD parse error:", err);
    } finally {
      setJdParsing(false);
    }
  };

  const canProceed = type !== "" && difficulty !== "";
  const canSubmit = canProceed && title.trim() !== "";

  const handleSubmit = () => {
    if (!canSubmit) return;
    console.log({ title, type, difficulty, questionCount, topics, description, jdText });
    // TODO: call API → createInterview(...) → router.push(`/interview/${id}`)
    onClose();
  };

  const suggestions = type ? TOPIC_SUGGESTIONS[type as InterviewType] : [];
  // Topics added by user that aren't in suggestions
  const extraTopics = topics.filter((t) => !suggestions.includes(t));

  return (
    <>
      <div className="csm-backdrop" onClick={onClose} />

      <div className="csm-container">
        {/* Header */}
        <div className="csm-header">
          <div>
            <div className="csm-title">Custom Session</div>
            <div className="csm-subtitle">Configure your interview practice</div>
          </div>
          <button className="csm-close" onClick={onClose}>✕</button>
        </div>

        {/* Steps */}
        <div className="csm-steps">
          {[
            { n: 1, label: "Setup" },
            { n: 2, label: "Topics" },
            { n: 3, label: "Job Description" },
          ].map(({ n, label }, idx, arr) => (
            <>
              <div key={n} className={`csm-step ${step >= n ? "active" : ""}`}>
                <span className="csm-step-num">{n}</span>
                <span className="csm-step-label">{label}</span>
              </div>
              {idx < arr.length - 1 && <div key={`line-${n}`} className="csm-step-line" />}
            </>
          ))}
        </div>

        {/* Body */}
        <div className="csm-body">

          {/* ── Step 1: Setup ── */}
          {step === 1 && (
            <div className="csm-step-content">
              <div className="csm-field">
                <label className="csm-label">Session Title</label>
                <input className="csm-input" placeholder="e.g. Google SWE Mock Round 1" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              <div className="csm-field">
                <label className="csm-label">Interview Type</label>
                <div className="csm-type-grid">
                  {INTERVIEW_TYPES.map((t) => (
                    <button key={t.value} className={`csm-type-card ${type === t.value ? "selected" : ""}`} onClick={() => { setType(t.value); setTopics([]); setJdTopics([]); }}>
                      <span className="csm-type-icon">{t.icon}</span>
                      <span className="csm-type-name">{t.label}</span>
                      <span className="csm-type-desc">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="csm-field">
                <label className="csm-label">Difficulty</label>
                <div className="csm-diff-row">
                  {DIFFICULTIES.map((d) => (
                    <button key={d.value} className={`csm-diff-btn csm-diff-${d.value.toLowerCase()} ${difficulty === d.value ? "selected" : ""}`} onClick={() => setDifficulty(d.value)}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="csm-field">
                <label className="csm-label">
                  Number of Questions <span className="csm-count-badge">{questionCount}</span>
                </label>
                <input type="range" min={3} max={15} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="csm-range" />
                <div className="csm-range-labels"><span>3</span><span>9</span><span>15</span></div>
              </div>
            </div>
          )}

          {/* ── Step 2: Topics ── */}
          {step === 2 && (
            <div className="csm-step-content">
              <div className="csm-field">
                <label className="csm-label">Focus Topics <span className="csm-optional">(optional)</span></label>
                <div className="csm-chips">
                  {suggestions.map((t) => (
                    <button key={t} className={`csm-chip ${topics.includes(t) ? "selected" : ""}`} onClick={() => toggleTopic(t)}>{t}</button>
                  ))}
                </div>
              </div>

              {/* Custom topic input */}
              <div className="csm-field">
                <label className="csm-label">Add Your Own Topic</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    className="csm-input"
                    placeholder="e.g. Kafka, Redis, Segment Trees..."
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCustomTopic()}
                  />
                  <button
                    className="csm-btn-primary"
                    style={{ padding: "0 1rem", flexShrink: 0 }}
                    onClick={addCustomTopic}
                    disabled={!customTopic.trim()}
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Show custom/extra topics as removable chips */}
              {extraTopics.length > 0 && (
                <div className="csm-field">
                  <label className="csm-label">Your Custom Topics</label>
                  <div className="csm-chips">
                    {extraTopics.map((t) => (
                      <button
                        key={t}
                        className="csm-chip selected"
                        onClick={() => removeCustomTopic(t)}
                        style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
                      >
                        {t} <span style={{ opacity: 0.6, fontSize: "0.7rem" }}>✕</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="csm-field">
                <label className="csm-label">Additional Notes <span className="csm-optional">(optional)</span></label>
                <textarea className="csm-textarea" placeholder="Any specific areas, weak points, or notes for the AI..." rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
          )}

          {/* ── Step 3: Job Description ── */}
          {step === 3 && (
            <div className="csm-step-content">
              <div className="csm-field">
                <label className="csm-label">
                  Paste Job Description
                  <span className="csm-optional" style={{ marginLeft: "0.4rem" }}>(optional)</span>
                </label>
                <p style={{ fontSize: "0.78rem", color: "var(--text-2)", marginBottom: "0.75rem", marginTop: "0.25rem" }}>
                  AI will read the JD and automatically suggest relevant topics to prepare for this specific role.
                </p>
                <textarea
                  className="csm-textarea"
                  placeholder="Paste the full job description here..."
                  rows={7}
                  value={jdText}
                  onChange={(e) => { setJdText(e.target.value); setJdTopics([]); }}
                />
                <button
                  className="csm-btn-primary"
                  style={{ marginTop: "0.75rem" }}
                  onClick={parseJD}
                  disabled={!jdText.trim() || jdParsing}
                >
                  {jdParsing ? "Analyzing…" : "✦ Extract Topics with AI"}
                </button>
              </div>

              {/* AI extracted topics */}
              {jdTopics.length > 0 && (
                <div className="csm-field">
                  <label className="csm-label">AI-Suggested Topics</label>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-2)", marginBottom: "0.6rem" }}>
                    These have been added to your session. Deselect any you don't want.
                  </p>
                  <div className="csm-chips">
                    {jdTopics.map((t) => (
                      <button
                        key={t}
                        className={`csm-chip ${topics.includes(t) ? "selected" : ""}`}
                        onClick={() => toggleTopic(t)}
                        style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
                      >
                        <span style={{ fontSize: "0.65rem", opacity: 0.7 }}>✦</span> {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Final summary */}
              <div className="csm-summary">
                <div className="csm-summary-row"><span>Type</span><span>{type}</span></div>
                <div className="csm-summary-row"><span>Difficulty</span><span>{difficulty}</span></div>
                <div className="csm-summary-row"><span>Questions</span><span>{questionCount}</span></div>
                {topics.length > 0 && (
                  <div className="csm-summary-row"><span>Topics</span><span>{topics.join(", ")}</span></div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="csm-footer">
          {step > 1 && (
            <button className="csm-btn-back" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>
              ← Back
            </button>
          )}
          {step < 3
            ? <button className="csm-btn-primary" disabled={step === 1 ? !canProceed : false} onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}>
              Next →
            </button>
            : <button className="csm-btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
              Start Session →
            </button>
          }
        </div>
      </div>
    </>
  );
}