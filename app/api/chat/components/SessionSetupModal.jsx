"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "gaduGator.sessionPrefs";

const defaultPrefs = {
  level: "A1",
  topic: "travel",
  style: "formal",
  motivationalMode: true,
};

const TOPICS = [
  "travel",
  "work",
  "daily life",
  "hobbies",
  "food",
  "shopping",
  "school",
  "technology",
];

export default function SessionSetupModal({ isOpen, onClose, onSave }) {
  const [prefs, setPrefs] = useState(defaultPrefs);
  const [customTopic, setCustomTopic] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPrefs({ ...defaultPrefs, ...JSON.parse(raw) });
      else setPrefs(defaultPrefs);
    } catch {
      setPrefs(defaultPrefs);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const effectiveTopic =
    prefs.topic === "custom"
      ? (customTopic.trim() || "travel")
      : (prefs.topic || "travel");

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <h2 style={{ marginTop: 0 }}>Start sesji</h2>

        <label style={styles.label}>
          Poziom (A1–C1)
          <select
            style={styles.input}
            value={prefs.level}
            onChange={(e) => setPrefs((p) => ({ ...p, level: e.target.value }))}
          >
            {["A1", "A2", "B1", "B2", "C1"].map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          Temat
          <select
            style={styles.input}
            value={prefs.topic}
            onChange={(e) => setPrefs((p) => ({ ...p, topic: e.target.value }))}
          >
            {TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value="custom">własny…</option>
          </select>
        </label>

        {prefs.topic === "custom" && (
          <label style={styles.label}>
            Własny temat
            <input
              style={styles.input}
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="np. airports, hotels, meetings…"
            />
          </label>
        )}

        <label style={styles.label}>
          Styl
          <select
            style={styles.input}
            value={prefs.style}
            onChange={(e) => setPrefs((p) => ({ ...p, style: e.target.value }))}
          >
            <option value="formal">formalny</option>
            <option value="casual">potoczny</option>
            <option value="humorous">humorystyczny</option>
          </select>
        </label>

        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={prefs.motivationalMode}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, motivationalMode: e.target.checked }))
            }
          />
          Tryb motywacyjny
        </label>

        <div style={styles.buttons}>
          <button onClick={onClose} style={styles.secondary}>
            Anuluj
          </button>

          <button
            onClick={() => {
              const toSave = { ...prefs, topic: effectiveTopic };
              localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
              onSave(toSave);
              onClose();
            }}
            style={styles.primary}
          >
            Zacznij
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: "100%",
    maxWidth: 520,
    background: "white",
    borderRadius: 12,
    padding: 18,
    maxHeight: "80vh",
    overflowY: "auto",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 12,
    fontSize: 14,
  },
  checkboxRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    marginBottom: 12,
    fontSize: 14,
  },
  input: {
    padding: 10,
    borderRadius: 8,
    border: "1px solid #ccc",
    fontSize: 14,
  },
  buttons: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8,
  },
  primary: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
  },
  secondary: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #ccc",
    background: "transparent",
    cursor: "pointer",
  },
};
