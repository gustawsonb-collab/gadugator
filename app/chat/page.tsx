"use client";

import React, { useEffect, useRef, useState } from "react";
import SessionSetupModal from "../api/chat/components/SessionSetupModal";

type Role = "user" | "assistant";
type Msg = {
  role: Role;
  text: string;
  feedback?: {
    corrected: string;
    tips: string[];
    alternatives: string[];
  } | null;
  feedbackOpen?: boolean;
};

type Mode = "coach" | "tutor" | "chitchat" | "work";
type Level = "A2" | "B1" | "B2";

const CHAT_STORAGE_KEY = "gadugator.chat.v1";

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 12,
  border: "1px solid #e5e5e5",
  background: "#fff",
  marginRight: 6,
};

export default function ChatPage() {
  const STORAGE_KEY = "gaduGator.sessionPrefs";

  const THEME_KEY = "gadugator.theme.v1";
const [dark, setDark] = useState(false);

  const [sessionPrefs, setSessionPrefs] = useState<any>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setSessionPrefs(JSON.parse(raw));
        setIsSetupOpen(false);
      } else {
        setIsSetupOpen(true);
      }
    } catch {
      setIsSetupOpen(true);
    }
  }, []);

useEffect(() => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark") setDark(true);
    if (saved === "light") setDark(false);
  } catch {}
}, []);

useEffect(() => {
  try {
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  } catch {}
}, [dark]);


  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("tutor");
  const [level, setLevel] = useState<Level>("B1");
  const [loading, setLoading] = useState(false);

  // STT state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Wczytanie historii
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        const cleaned: Msg[] = parsed
          .filter(
            (x: any) =>
              x &&
              (x.role === "user" || x.role === "assistant") &&
              typeof x.text === "string"
          )
          .map((x: any) => ({ role: x.role as Role, text: x.text as string }));

        setMsgs(cleaned);
      }
    } catch {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    }
  }, []);

  // Zapis historii
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(msgs.slice(-60)));
    } catch {}
  }, [msgs]);

  function clearChat() {
    setMsgs([]);
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {}
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const nextMsgs: Msg[] = [...msgs, { role: "user", text }];
    setMsgs(nextMsgs);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMsgs.map((m) => ({ role: m.role, content: m.text })),
          mode,
          sessionPrefs,
          level,
        }),
      });

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        const backendMsg =
          typeof data?.error === "string" && data.error.trim()
            ? data.error.trim()
            : `HTTP ${res.status}`;
        throw new Error(backendMsg);
      }

      const aiText = String(data?.text ?? "").trim();
      const fb = data?.feedback ?? null;

      setMsgs([
        ...nextMsgs,
        {
          role: "assistant",
          text: aiText || "(pusta odpowiedź)",
          feedback: fb,
          feedbackOpen: !!(
            fb &&
            (fb.corrected ||
              (fb.tips?.length ?? 0) > 0 ||
              (fb.alternatives?.length ?? 0) > 0)
          ),
        },
      ]);

      // TTS (opcjonalnie)
      if ("speechSynthesis" in window && aiText) {
        const u = new SpeechSynthesisUtterance(aiText);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
    } catch (e: any) {
      const msg =
        typeof e?.message === "string" && e.message.trim()
          ? e.message.trim()
          : "Nie udało się połączyć z AI.";

      setMsgs([
        ...nextMsgs,
        {
          role: "assistant",
          text: msg,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function startRecording() {
    if (isRecording || isTranscribing) return;
    setSttError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mr = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        // zwolnij mikrofon
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], "speech.webm", { type: "audio/webm" });

        const fd = new FormData();
        fd.append("file", file);

        setIsTranscribing(true);
        try {
          const res = await fetch("/api/stt", { method: "POST", body: fd });
          const data = await res.json().catch(() => ({} as any));

          if (!res.ok) {
            const backendMsg =
              typeof data?.error === "string" && data.error.trim()
                ? data.error.trim()
                : `HTTP ${res.status}`;
            throw new Error(backendMsg);
          }

          const text = String(data?.text ?? "").trim();

if (text) {
  setInput((prev) => (prev ? prev + " " : "") + text);
} else {
  setSttError("Nie udało się rozpoznać mowy — spróbuj powiedzieć coś dłużej.");
}

        } catch (e: any) {
          setSttError(
            typeof e?.message === "string" && e.message.trim()
              ? e.message.trim()
              : "STT error"
          );
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);

      // ✅ auto-stop po 30s (zabezpieczenie)
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          stopRecording();
        }
      }, 30000);
    } catch (e: any) {
      setSttError(
        typeof e?.message === "string" && e.message.trim()
          ? e.message.trim()
          : "Brak dostępu do mikrofonu."
      );
    }
  }

  function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr) return;

    try {
      mr.stop();
    } catch {}
    setIsRecording(false);
  }

  const sessionLabel = sessionPrefs
    ? [sessionPrefs.level, sessionPrefs.topic, sessionPrefs.style]
        .filter(Boolean)
        .join(" • ")
    : "";

  return (
  <div
    style={{
      minHeight: "100vh",
      background: dark ? "#0b0b0f" : "#f6f6f6",
    }}
  >
    <SessionSetupModal
      isOpen={isSetupOpen}
      onClose={() => setIsSetupOpen(false)}
      onSave={(prefs: any) => setSessionPrefs(prefs)}
    />

      <div
  style={{
    maxWidth: 760,
    margin: "0 auto",
    padding: 16,
    color: dark ? "#eee" : "#111",
  }}
>

        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
          GaduGator
        </h1>

        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            Mode
            {/* <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="coach">coach</option>
              <option value="tutor">tutor</option>
              <option value="chitchat">chitchat</option>
              <option value="work">work</option>
            </select> */}
          </label>

          <button onClick={clearChat} type="button">
            Wyczyść
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {sessionLabel && (
              <span style={{ fontSize: 13, opacity: 0.7 }}>{sessionLabel}</span>
            )}

            <button
              type="button"
              onClick={() => setIsSetupOpen(true)}
              title="Ustawienia sesji"
              aria-label="Ustawienia sesji"
            >
              ⚙️
            </button>
<button
  type="button"
  onClick={() => setDark((v) => !v)}
  title="Motyw"
  aria-label="Motyw"
>
  {dark ? "☀️" : "🌙"}
</button>


          </div>
        </div>

        <div
          style={{
            border: dark ? "1px solid #2a2a38" : "1px solid #ddd",
            borderRadius: 12,
            padding: 12,
            height: 420,
            overflow: "auto",
            background: dark ? "#12121a" : "#fff",
          }}
        >
          {msgs.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Napisz wiadomość, aby zacząć.</div>
          ) : (
            msgs.map((m, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <b>{m.role === "user" ? "Ty" : "GaduGator"}:</b> {m.text}

                {m.role === "assistant" && m.feedback && (
                  <div
                    style={{
                      marginTop: 8,
                      marginLeft: 12,
                      fontSize: 13,
                      opacity: 0.95,
                      border: dark ? "1px solid #2a2a38" : "1px solid #eee",
                      borderRadius: 10,
                      padding: "8px 10px",
                      background: dark ? "#161622" : "#fafafa",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMsgs((prev) =>
                          prev.map((msg, idx) =>
                            idx === i
                              ? { ...msg, feedbackOpen: !msg.feedbackOpen }
                              : msg
                          )
                        );
                      }}
                      style={{
                        fontWeight: 700,
                        marginBottom: 6,
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      💡 Mini-feedback {m.feedbackOpen ? "▲" : "▼"}
                    </button>

                    {m.feedbackOpen && (
                      <>
                        {m.feedback.corrected ? (
                          <div style={{ marginBottom: 4 }}>
                            <span style={badgeStyle}>Corrected</span>
                            {m.feedback.corrected}
                          </div>
                        ) : null}

                        {m.feedback.tips?.length ? (
                          <div style={{ marginBottom: 4 }}>
                            <span style={badgeStyle}>Tips</span>
                            {m.feedback.tips.join(" • ")}
                          </div>
                        ) : null}

                        {m.feedback.alternatives?.length ? (
                          <div>
                            <span style={badgeStyle}>Alternatives</span>
                            {m.feedback.alternatives.join(" / ")}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 12,
            alignItems: "center",
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Napisz..."
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 10,
              border: dark ? "1px solid #2a2a38" : "1px solid #ddd",
background: dark ? "#12121a" : "#fff",
color: dark ? "#eee" : "#111",

            }}
            onKeyDown={(e) => {
  if (e.key === "Enter") {
    if (isRecording || isTranscribing) return;
    send();
  }
}}

          />

          {/* 🎙️ Press & hold */}
          <button
            type="button"
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={loading || isTranscribing}
            title={isRecording ? "Nagrywam..." : "Przytrzymaj, aby mówić"}
            aria-label={
              isRecording ? "Nagrywanie" : "Naciśnij i przytrzymaj, aby nagrywać"
            }
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: isRecording ? "#ffecec" : "#fff",
              cursor: loading || isTranscribing ? "not-allowed" : "pointer",
              userSelect: "none",
              WebkitUserSelect: "none",
              boxShadow: isRecording ? "0 0 0 6px rgba(255, 0, 0, 0.12)" : "none",
transition: "box-shadow 0.2s ease",

            }}
          >
            {isRecording ? "⏺️" : "🎙️"}
          </button>

          <button onClick={send} disabled={loading} type="button">
            {loading ? "..." : "Wyślij"}
          </button>
        </div>

       {(isRecording || isTranscribing || sttError) && (
  <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
    {isRecording ? "Nagrywam... (puść przycisk, aby zakończyć)" : null}
    {isTranscribing ? " Transcribing..." : null}
    {sttError ? ` STT error: ${sttError}` : null}
  </div>
)}

      </div>
    </div>
  );
}
