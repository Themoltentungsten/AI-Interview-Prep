"use client";
import { useEffect, useState } from "react";

type Skill = {
  id: string;
  name: string;
  category?: string;
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const res = await fetch("/api/get-skills");

        if (!res.ok) {
          throw new Error("Failed to fetch skills");
        }

        const data = await res.json();
        const normalized: Skill[] = Array.isArray(data.data)
          ? data.data.map((entry: any) => entry.skill)
          : [];
        setSkills(normalized);
      } catch (err) {
        console.error("Error fetching skills:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSkills();
  }, []);

  // Group skills by category
  const grouped = skills.reduce<Record<string, Skill[]>>((acc, skill) => {
    const cat = skill.category ?? "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(skill);
    return acc;
  }, {});

  return (
    <>
      {/* Top bar */}
      <div className="dash-topbar">
        <div>
          <div className="dash-greeting">Skill <em>Breakdown</em></div>
          <div className="dash-date">Your proficiency across all interview categories</div>
        </div>
        <div className="topbar-actions">
          <button className="btn-new-session">+ Practice Weak Skills</button>
        </div>
      </div>

      {/* Summary row */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="dash-stat-card anim-0">
          <div className="dash-stat-top"><span className="stat-card-dot dot-gold" /><span className="dash-stat-label">Strongest Skill</span></div>
          <div className="dash-stat-value" style={{ fontSize: "1.2rem" }}>System Design</div>
          <div className="dash-stat-delta">Score: 84 / 100</div>
        </div>
        <div className="dash-stat-card anim-1">
          <div className="dash-stat-top"><span className="stat-card-dot dot-accent" /><span className="dash-stat-label">Needs Most Work</span></div>
          <div className="dash-stat-value" style={{ fontSize: "1.2rem" }}>OS Concepts</div>
          <div className="dash-stat-delta">Score: 48 / 100</div>
        </div>
        <div className="dash-stat-card anim-2">
          <div className="dash-stat-top"><span className="stat-card-dot dot-violet" /><span className="dash-stat-label">Overall Average</span></div>
          <div className="dash-stat-value">65<span className="dash-stat-unit">/ 100</span></div>
          <div className="dash-stat-delta">+4 pts this week</div>
        </div>
      </div>

      {/* Skill breakdown grouped by category */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">All Skills</div>
            <div className="panel-sub">Based on your sessions</div>
          </div>
        </div>

        <div className="skill-list skill-list-lg">
          {loading ? (
            <div style={{ color: "var(--text-2)", fontSize: "0.85rem" }}>Loading skills…</div>
          ) : skills.length > 0 ? (
            Object.entries(grouped).map(([category, categorySkills], gi) => (
              <div key={category} style={{ marginBottom: "1.5rem" }}>
                {/* Category heading */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  marginBottom: "0.6rem",
                }}>
                  <span style={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-2)",
                  }}>
                    {category}
                  </span>
                  <span style={{
                    fontSize: "0.7rem",
                    color: "var(--text-3, var(--text-2))",
                    background: "var(--surface-2, rgba(255,255,255,0.06))",
                    borderRadius: "999px",
                    padding: "0.1rem 0.5rem",
                  }}>
                    {categorySkills.length}
                  </span>
                  <div style={{ flex: 1, height: "1px", background: "var(--border, rgba(255,255,255,0.08))" }} />
                </div>

                {/* Skills as chips */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {categorySkills.map((s) => (
                    <span
                      key={s.id}
                      className="skill-name"
                      style={{
                        padding: "0.35rem 0.8rem",
                        borderRadius: "999px",
                        fontSize: "0.8rem",
                        border: "1px solid var(--border, rgba(255,255,255,0.1))",
                        background: "var(--surface-2, rgba(255,255,255,0.04))",
                        color: "var(--text-1)",
                      }}
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div style={{ color: "var(--text-2)", fontSize: "0.85rem" }}>
              No skills right now — try enhancing your resume.
            </div>
          )}
        </div>
      </div>

      {/* Recommendation panel
      <div className="panel" style={{ background: "rgba(255,92,53,0.04)", borderColor: "rgba(255,92,53,0.2)" }}>
        <div className="panel-header">
          <div><div className="panel-title">AI Recommendation</div><div className="panel-sub">Based on your weak areas</div></div>
          <span className="tag tag-accent">AI Coach</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[
            "OS Concepts — Start with process scheduling basics (1 session)",
            "SQL & Databases — Focus on indexing strategies (2 sessions)",
            "Data Structures — Practice graph traversal problems (1 session)",
          ].map((rec, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ color: "var(--accent-2)", fontSize: "0.9rem", flexShrink: 0 }}>→</span>
              <span style={{ fontSize: "0.83rem", color: "var(--text-2)" }}>{rec}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "1.25rem" }}>
          <button className="resume-action-btn primary">Start Recommended Session</button>
        </div>
      </div> */}
    </>
  );
}