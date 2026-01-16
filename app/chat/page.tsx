"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import SessionSetupModal from "../api/chat/components/SessionSetupModal";

type Role = "user" | "assistant";

type Feedback = {
  corrected: string;
  tips: string[];
  alternatives: string[];
};

type Msg = {
  id: string;
  role: Role;
  text: string;
  feedback: Feedback | null; // user: null
  feedbackOpen: boolean;
  meta?: { kind?: "onboarding" };
};

type Mode = "coach" | "tutor" | "chitchat" | "work";
type Level = "A2" | "B1" | "B2";

const CHAT_STORAGE_KEY_V3 = "gadugator.chat.v3";
const CHAT_STORAGE_KEY_V2 = "gadugator.chat.v2";
const CHAT_STORAGE_KEY_V1 = "gadugator.chat.v1";

const SESSION_PREFS_KEY = "gaduGator.sessionPrefs";
const THEME_KEY = "gadugator.theme.v1";
const ONBOARDED_KEY = "gadugator.onboarded.v1";

const FREE_DAILY_LIMIT = 15;
const USAGE_KEY = "gadugator.usage.v1";
const PREMIUM_KEY = "gadugator.premium.v1";


const TTS_ENABLED_KEY = "gadugator.tts.enabled.v2";
const TTS_VOICE_KEY = "gadugator.tts.voice.v2";

type TTSVoice =
  | "marin"
  | "cedar"
  | "coral"
  | "alloy"
  | "nova"
  | "shimmer"
  | "onyx"
  | "sage"
  | "echo"
  | "fable"
  | "ash"
  | "ballad"
  | "verse";

const TTS_VOICES: TTSVoice[] = [
  "marin",
  "cedar",
  "coral",
  "alloy",
  "nova",
  "shimmer",
  "onyx",
  "sage",
  "echo",
  "fable",
  "ash",
  "ballad",
  "verse",
];

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 12,
  border: "1px solid #e5e5e5",
  background: "#fff",
  marginRight: 6,
};

function safeUUID(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }
}

function normalizeRole(x: any): Role {
  return x === "user" ? "user" : "assistant";
}

function normalizeFeedback(anyFb: any): Feedback | null {
  if (!anyFb) return null;

  const fb =
    anyFb && typeof anyFb === "object" && "feedback" in anyFb
      ? (anyFb as any).feedback
      : anyFb;

  if (!fb || typeof fb !== "object") return null;

  const corrected =
    typeof (fb as any).corrected === "string" ? (fb as any).corrected : "";
  const tips = Array.isArray((fb as any).tips)
    ? (fb as any).tips.filter((t: any) => typeof t === "string")
    : [];
  const alternatives = Array.isArray((fb as any).alternatives)
    ? (fb as any).alternatives.filter((t: any) => typeof t === "string")
    : [];

  if (!corrected && tips.length === 0 && alternatives.length === 0) return null;
  return { corrected, tips, alternatives };
}

function minimalFeedbackClient(userText: string): Feedback {
  const u = (userText ?? "").trim();
  return {
    corrected: "",
    tips: ["Tip: add one short follow-up question to keep the conversation going."],
    alternatives: u
      ? [`Alternative: "${u}"`, "Alternative: try a shorter sentence + a follow-up question."]
      : ["Alternative: try one short sentence + one question."],
  };
}

function makeUserMsg(text: string): Msg {
  return { id: safeUUID(), role: "user", text, feedback: null, feedbackOpen: false };
}

function makeAssistantMsg(text: string, feedback: Feedback): Msg {
  return { id: safeUUID(), role: "assistant", text, feedback, feedbackOpen: true };
}

function readChatFromStorage(): any[] | null {
  const keys = [CHAT_STORAGE_KEY_V3, CHAT_STORAGE_KEY_V2, CHAT_STORAGE_KEY_V1];

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (key !== CHAT_STORAGE_KEY_V3) {
          try {
            localStorage.setItem(CHAT_STORAGE_KEY_V3, JSON.stringify(parsed));
            localStorage.removeItem(key);
          } catch {}
        }
        return parsed;
      }
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
  }
  return null;
}

function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return false;
  }
}

function setOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {}
}

function buildOnboardingMessages(): Msg[] {
  return [
    {
      id: safeUUID(),
      role: "assistant",
      text: "👋 Hi! I’m **GaduGator** 🐊\nI help you practice English naturally — by chatting, correcting mistakes, and speaking out loud.",
      feedback: minimalFeedbackClient(""),
      feedbackOpen: false,
      meta: { kind: "onboarding" },
    },
    {
      id: safeUUID(),
      role: "assistant",
      text: "You can:\n• ✍️ Write and get corrections\n• 🎤 Speak and I’ll understand you\n• 🔊 Listen to my answers (natural voice)",
      feedback: minimalFeedbackClient(""),
      feedbackOpen: false,
      meta: { kind: "onboarding" },
    },
    {
      id: safeUUID(),
      role: "assistant",
      text: "How would you like to start?",
      feedback: minimalFeedbackClient(""),
      feedbackOpen: false,
      meta: { kind: "onboarding" },
    },
  ];
}
function todayKey(): string {
  // prosty klucz dzienny w local time
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isPremium(): boolean {
  try {
    return localStorage.getItem(PREMIUM_KEY) === "1";
  } catch {
    return false;
  }
}

function getUsage(): { day: string; count: number } {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return { day: todayKey(), count: 0 };
    const parsed = JSON.parse(raw);
    const day = typeof parsed?.day === "string" ? parsed.day : todayKey();
    const count = typeof parsed?.count === "number" ? parsed.count : 0;
    return { day, count };
  } catch {
    return { day: todayKey(), count: 0 };
  }
}

function setUsage(u: { day: string; count: number }) {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(u));
  } catch {}
}

function getTodayCount(): number {
  const u = getUsage();
  const t = todayKey();
  if (u.day !== t) {
    const reset = { day: t, count: 0 };
    setUsage(reset);
    return 0;
  }
  return Math.max(0, u.count);
}

function incTodayCount(): number {
  const t = todayKey();
  const u = getUsage();
  const next = u.day === t ? { day: t, count: (u.count ?? 0) + 1 } : { day: t, count: 1 };
  setUsage(next);
  return next.count;
}

export default function ChatPage() {
  const [dark, setDark] = useState(false);

  const [sessionPrefs, setSessionPrefs] = useState<any>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const msgsRef = useRef<Msg[]>([]);
  useEffect(() => {
    msgsRef.current = msgs;
  }, [msgs]);

  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("tutor");
  const [level, setLevel] = useState<Level>("B1");
  const [loading, setLoading] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
const [premium, setPremium] = useState(false);
const [isPaywallOpen, setIsPaywallOpen] = useState(false);


  // STT state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // ✅ Backend TTS state
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [ttsVoice, setTtsVoice] = useState<TTSVoice>("marin");
  const [ttsError, setTtsError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const sessionLabel = useMemo(() => {
    return sessionPrefs
      ? [sessionPrefs.level, sessionPrefs.topic, sessionPrefs.style].filter(Boolean).join(" • ")
      : "";
  }, [sessionPrefs]);

  // Theme load/save
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

  // Session prefs load/save
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_PREFS_KEY);
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
      if (sessionPrefs) localStorage.setItem(SESSION_PREFS_KEY, JSON.stringify(sessionPrefs));
    } catch {}
  }, [sessionPrefs]);

  // TTS prefs
  useEffect(() => {
    try {
      const e = localStorage.getItem(TTS_ENABLED_KEY);
      if (e === "0") setTtsEnabled(false);
      if (e === "1") setTtsEnabled(true);

      const v = localStorage.getItem(TTS_VOICE_KEY);
      if (v && (TTS_VOICES as string[]).includes(v)) setTtsVoice(v as TTSVoice);
    } catch {}
  }, []);
  useEffect(() => {
  setPremium(isPremium());
  setTodayCount(getTodayCount());
}, []);


  useEffect(() => {
    try {
      localStorage.setItem(TTS_ENABLED_KEY, ttsEnabled ? "1" : "0");
    } catch {}
  }, [ttsEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(TTS_VOICE_KEY, ttsVoice);
    } catch {}
  }, [ttsVoice]);

  function stopVoice() {
    try {
      ttsAbortRef.current?.abort();
      ttsAbortRef.current = null;
    } catch {}

    try {
      const a = audioRef.current;
      if (a) {
        a.onended = null;
        a.onpause = null;
        a.pause();
        a.currentTime = 0;
        a.src = "";
      }
    } catch {}

    setIsPlaying(false);
  }

  async function playTTS(text: string) {
    if (!ttsEnabled) return;
    const t = (text ?? "").trim();
    if (!t) return;

    setTtsError(null);
    stopVoice();
    setIsPlaying(true);

    const ctrl = new AbortController();
    ttsAbortRef.current = ctrl;

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({ text: t, voice: ttsVoice }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        const msg = typeof data?.error === "string" ? data.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = audioRef.current ?? new Audio();
      audioRef.current = a;

      a.onended = () => {
        setIsPlaying(false);
        try {
          URL.revokeObjectURL(url);
        } catch {}
      };

      a.onpause = () => {
        setIsPlaying(false);
      };

      a.src = url;
      a.volume = 1;
      await a.play();
    } catch (e: any) {
      if (String(e?.name) === "AbortError") return;
      setIsPlaying(false);
      setTtsError(typeof e?.message === "string" ? e.message : "TTS error");
    } finally {
      ttsAbortRef.current = null;
      // jeśli audio nadal gra, onended/onpause ustawi false; tu robimy safe-guard
      // (nie wymuszamy false, żeby nie migało)
    }
  }

  // Autoscroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  // ✅ Load chat history + onboarding (JEDEN useEffect — bez duplikatów)
  useEffect(() => {
    const parsed = readChatFromStorage();

    // 1) Brak historii -> onboarding (tylko raz)
    if (!parsed || parsed.length === 0) {
      if (!hasOnboarded()) {
        const onboarding = buildOnboardingMessages();
        setMsgs(onboarding);
        setOnboarded();
      }
      return;
    }

    // 2) Jest historia -> normalizacja i rebuild feedback
    const base = parsed
      .filter((x: any) => x && typeof x.text === "string")
      .map((x: any) => ({
        id: typeof x.id === "string" && x.id ? x.id : safeUUID(),
        role: normalizeRole(x.role),
        text: String(x.text),
        feedback: x.feedback ?? null,
        feedbackOpen: typeof x.feedbackOpen === "boolean" ? x.feedbackOpen : true,
        meta: x.meta && typeof x.meta === "object" ? x.meta : undefined,
      }));

    const rebuilt: Msg[] = base.map((x: any, idx: number) => {
      if (x.role === "user") {
        return { id: x.id, role: "user", text: x.text, feedback: null, feedbackOpen: false, meta: x.meta };
      }

      let prevUserText = "";
      for (let i = idx - 1; i >= 0; i--) {
        if (base[i].role === "user") {
          prevUserText = base[i].text;
          break;
        }
      }

      const fb = normalizeFeedback(x.feedback) ?? minimalFeedbackClient(prevUserText);
      return { id: x.id, role: "assistant", text: x.text, feedback: fb, feedbackOpen: x.feedbackOpen, meta: x.meta };
    });

    setMsgs(rebuilt);
  }, []);

  // Save chat history (keep last 80)
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY_V3, JSON.stringify(msgs.slice(-80)));
    } catch {}
  }, [msgs]);

  function clearChat() {
    setMsgs([]);
    stopVoice();
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY_V3);
      localStorage.removeItem(CHAT_STORAGE_KEY_V2);
      localStorage.removeItem(CHAT_STORAGE_KEY_V1);
    } catch {}
  }
  function activatePremiumTest() {
  try {
    localStorage.setItem(PREMIUM_KEY, "1");
  } catch {}
  setPremium(true);
  setIsPaywallOpen(false);
}

function exportChatTxt() {
  try {
    const lines = msgs.map((m) => `${m.role === "user" ? "User" : "GaduGator"}: ${m.text}`);
    const content = lines.join("\n\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "gadugator-chat.txt";
    a.click();

    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }, 1000);
  } catch {}
}

  function toggleFeedback(msgId: string) {
    setMsgs((prev) => prev.map((m) => (m.id === msgId ? { ...m, feedbackOpen: !m.feedbackOpen } : m)));
  }

  function getPrevUserTextFromArray(arr: Msg[], idx: number) {
    for (let i = idx - 1; i >= 0; i--) if (arr[i].role === "user") return arr[i].text;
    return "";
  }

  async function send() {
    const userText = input.trim();
    if (!userText || loading || isRecording || isTranscribing) return;

    // ✅ Free limit guard
if (!premium) {
  const count = getTodayCount();
  if (count >= FREE_DAILY_LIMIT) {
    setIsPaywallOpen(true);

    const fb = minimalFeedbackClient(userText);
    setMsgs((prev) => [
      ...prev,
      makeAssistantMsg(
        `🔒 Free limit reached (${FREE_DAILY_LIMIT}/day). Upgrade to Premium to continue.`,
        fb
      ),
    ]);
    return;
  }
}


    setInput("");
    setLoading(true);

    const userMsg = makeUserMsg(userText);
    setMsgs((prev) => [...prev, userMsg]);
if (!premium) {
  const next = incTodayCount();
  setTodayCount(next);
}

    try {
      const snapshot = [...msgsRef.current, userMsg];
      const payloadMessages = snapshot.map((m) => ({ role: m.role, content: m.text }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payloadMessages, mode, sessionPrefs, level }),
      });

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const backendMsg =
          typeof data?.error === "string" && data.error.trim() ? data.error.trim() : `HTTP ${res.status}`;
        throw new Error(backendMsg);
      }

      const aiText = String(data?.text ?? "").trim() || "(pusta odpowiedź)";
      const fb = normalizeFeedback(data?.feedback) ?? minimalFeedbackClient(userText);

      setMsgs((prev) => [...prev, makeAssistantMsg(aiText, fb)]);

      // AUTO-TTS: obecne zachowanie zostawiamy (czyta automatycznie)
      void playTTS(aiText);
    } catch (e: any) {
      const errText =
        typeof e?.message === "string" && e.message.trim() ? e.message.trim() : "Nie udało się połączyć z AI.";

      const fb = minimalFeedbackClient(userText);
      setMsgs((prev) => [...prev, makeAssistantMsg(errText, fb)]);
      void playTTS(errText);
    } finally {
      setLoading(false);
    }
  }

  async function startRecording() {
    if (isRecording || isTranscribing || loading) return;
    setSttError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
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
              typeof data?.error === "string" && data.error.trim() ? data.error.trim() : `HTTP ${res.status}`;
            throw new Error(backendMsg);
          }

          const text = String(data?.text ?? "").trim();
          if (text) setInput((prev) => (prev ? prev + " " : "") + text);
          else setSttError("Nie udało się rozpoznać mowy — spróbuj powiedzieć coś dłużej.");
        } catch (e: any) {
          setSttError(typeof e?.message === "string" && e.message.trim() ? e.message.trim() : "STT error");
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);

      setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") stopRecording();
      }, 30000);
    } catch (e: any) {
      setSttError(typeof e?.message === "string" && e.message.trim() ? e.message.trim() : "Brak dostępu do mikrofonu.");
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

  // CTA dopóki user nie napisze pierwszej wiadomości
  const hasAnyUserMsg = msgs.some((m) => m.role === "user");
  const showOnboardingCta = !hasAnyUserMsg && msgs.length > 0;

  return (
    <div style={{ minHeight: "100vh", background: dark ? "#0b0b0f" : "#f6f6f6" }}>
      <SessionSetupModal
        isOpen={isSetupOpen}
        onClose={() => setIsSetupOpen(false)}
        onSave={(prefs: any) => {
          setSessionPrefs(prefs);
          setIsSetupOpen(false);
        }}
      />

     <div
  style={{
    maxWidth: 760,
    margin: "0 auto",
    padding: 16,
    color: dark ? "#eee" : "#111",
    display: "flex",
    flexDirection: "column",
    minHeight: "100svh", // lepsze na mobile niż 100vh
  }}
>

        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>GaduGator ✅ PAGE-TSX-OK</div>

        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>GaduGator</h1>

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", opacity: 0.8 }}>
            Mode: <b style={{ opacity: 1 }}>{mode}</b>
          </label>

          <button onClick={clearChat} type="button">
  New chat
</button>

<button onClick={exportChatTxt} type="button" disabled={msgs.length === 0}>
  Export
</button>



          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {sessionLabel ? <span style={{ fontSize: 13, opacity: 0.7 }}>{sessionLabel}</span> : null}

            {/* ⚙️ ustawienia sesji */}
            <button
              type="button"
              onClick={() => setIsSetupOpen(true)}
              title="Ustawienia sesji"
              aria-label="Ustawienia sesji"
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: dark ? "1px solid #2a2a38" : "1px solid #ddd",
                background: dark ? "#12121a" : "#fff",
                color: "inherit",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              ⚙️
            </button>

            {/* 🔊 / 🔇 */}
            <button
              type="button"
              onClick={() => {
                setTtsEnabled((v) => !v);
                stopVoice();
                setTtsError(null);
              }}
              title="Głos (czytanie)"
              aria-label="Głos (czytanie)"
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: dark ? "1px solid #2a2a38" : "1px solid #ddd",
                background: dark ? "#12121a" : "#fff",
                color: "inherit",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {ttsEnabled ? "🔊" : "🔇"}
            </button>

            {/* PLAY/STOP (ten sam przycisk) */}
            <button
              type="button"
              onClick={() => {
                if (isPlaying) {
                  stopVoice();
                  return;
                }
                if (!ttsEnabled) return;
                const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
                if (!lastAssistant) return;
                void playTTS(lastAssistant.text);
              }}
              title={isPlaying ? "Stop" : "Play last answer"}
              aria-label={isPlaying ? "Stop" : "Play last answer"}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: dark ? "1px solid #2a2a38" : "1px solid #ddd",
                background: dark ? "#12121a" : "#fff",
                color: "inherit",
                fontWeight: 700,
                cursor: "pointer",
                opacity: ttsEnabled ? 1 : 0.5,
              }}
            >
              {isPlaying ? "⏹ STOP" : "▶️ PLAY"}
            </button>

            {/* wybór głosu */}
            {ttsEnabled ? (
              <select
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value as TTSVoice)}
                style={{
                  padding: "6px 8px",
                  borderRadius: 10,
                  border: dark ? "1px solid #2a2a38" : "1px solid #ddd",
                  background: dark ? "#12121a" : "#fff",
                  color: "inherit",
                }}
                title="Voice"
              >
                {TTS_VOICES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ) : null}

            {/* motyw */}
            <button
              type="button"
              onClick={() => setDark((v) => !v)}
              title="Motyw"
              aria-label="Motyw"
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: dark ? "1px solid #2a2a38" : "1px solid #ddd",
                background: dark ? "#12121a" : "#fff",
                color: "inherit",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {dark ? "☀️" : "🌙"}
            </button>
          </div>
        </div>

        {ttsError ? (
          <div style={{ marginBottom: 10, fontSize: 13, opacity: 0.9 }}>⚠️ Voice error: {ttsError}</div>
        ) : null}
        {isPaywallOpen ? (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      zIndex: 50,
    }}
    onClick={() => setIsPaywallOpen(false)}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        maxWidth: 520,
        borderRadius: 16,
        border: dark ? "1px solid #2a2a38" : "1px solid #ddd",
        background: dark ? "#12121a" : "#fff",
        color: "inherit",
        padding: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Upgrade to Premium</div>
        <button
          type="button"
          onClick={() => setIsPaywallOpen(false)}
          style={{
            border: "none",
            background: "transparent",
            color: "inherit",
            fontSize: 18,
            cursor: "pointer",
            fontWeight: 800,
          }}
          aria-label="Close"
          title="Close"
        >
          ✕
        </button>
      </div>

      <div style={{ marginTop: 10, opacity: 0.9, lineHeight: 1.45 }}>
        <div style={{ marginBottom: 8 }}>
          You’ve reached the free daily limit (<b>{FREE_DAILY_LIMIT}/day</b>).
        </div>
        <div style={{ marginBottom: 8 }}>Premium unlocks:</div>
        <ul style={{ margin: 0, paddingLeft: 18, opacity: 0.95 }}>
          <li>Unlimited messages</li>
          <li>Full voice practice (TTS)</li>
          <li>Priority improvements</li>
        </ul>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={activatePremiumTest}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: dark ? "1px solid #2a2a38" : "1px solid #ddd",
            background: dark ? "#1a1a28" : "#111",
            color: dark ? "#fff" : "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          ⭐ Upgrade (test)
        </button>

        <button
          type="button"
          onClick={() => setIsPaywallOpen(false)}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: dark ? "1px solid #2a2a38" : "1px solid #ddd",
            background: dark ? "#12121a" : "#fff",
            color: "inherit",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Not now 
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        (Dev mode) This button simulates payment by setting <code>gadugator.premium.v1</code> in localStorage.
      </div>
    </div>
  </div>
) : null}


        <div
  style={{
    border: dark ? "1px solid #2a2a38" : "1px solid #ddd",
    borderRadius: 12,
    padding: 12,
    flex: 1,
    minHeight: 0, // KLUCZ: pozwala flex-child się scrollować
    overflow: "auto",
    background: dark ? "#12121a" : "#fff",
  }}
>

          {msgs.length === 0 ? (
            <div style={{ opacity: 0.75, lineHeight: 1.5 }}>
              <div style={{ marginBottom: 8 }}>Kliknij mikrofon 🎙️ albo wpisz wiadomość, żeby zacząć.</div>
              <div style={{ fontSize: 13, opacity: 0.85 }}>
                Protip: napisz krótkie zdanie po angielsku + jedno pytanie (np. “I worked today. What did you do?”).
              </div>
            </div>
          ) : (
            <div>
              {msgs.map((m, idx) => {
                const isBot = m.role !== "user";
                const prevUserText = getPrevUserTextFromArray(msgs, idx);
                const fb = isBot ? (normalizeFeedback(m.feedback) ?? minimalFeedbackClient(prevUserText)) : null;

                return (
                  <div key={m.id} style={{ marginBottom: 10 }}>
                    <b>{m.role === "user" ? "Ty" : "GaduGator"}:</b> {m.text}

                    {isBot && fb ? (
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
                          onClick={() => toggleFeedback(m.id)}
                          style={{
                            fontWeight: 700,
                            marginBottom: 6,
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            color: "inherit",
                          }}
                        >
                          💡 Mini-feedback {m.feedbackOpen ? "▲" : "▼"}
                        </button>

                        {m.feedbackOpen ? (
                          <div>
                            {fb.corrected ? (
                              <div style={{ marginBottom: 4 }}>
                                <span style={badgeStyle}>Corrected</span>
                                {fb.corrected}
                              </div>
                            ) : null}

                            {fb.tips?.length ? (
                              <div style={{ marginBottom: 4 }}>
                                <span style={badgeStyle}>Tips</span>
                                {fb.tips.join(" • ")}
                              </div>
                            ) : null}

                            {fb.alternatives?.length ? (
                              <div>
                                <span style={badgeStyle}>Alternatives</span>
                                {fb.alternatives.join(" / ")}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {showOnboardingCta ? (
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                void startRecording();
              }}
              style={{ padding: "8px 10px", borderRadius: 10, border: dark ? "1px solid #2a2a38" : "1px solid #ddd" }}
            >
              🎤 I want to speak
            </button>

            <button
              type="button"
              onClick={() => {
                setInput("I did mistake yesterday.");
              }}
              style={{ padding: "8px 10px", borderRadius: 10, border: dark ? "1px solid #2a2a38" : "1px solid #ddd" }}
            >
              ✍️ Correct my sentence
            </button>

            <button
              type="button"
              onClick={() => {
                setInput("Let’s talk about travel. Ask me questions and correct my mistakes.");
              }}
              style={{ padding: "8px 10px", borderRadius: 10, border: dark ? "1px solid #2a2a38" : "1px solid #ddd" }}
            >
              🎓 Practice conversation
            </button>
          </div>
        ) : null}

        <div
  style={{
    position: "sticky",
    bottom: 0,
    marginTop: 12,
    paddingTop: 10,
    paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
    background: dark ? "#0b0b0f" : "#f6f6f6",
    display: "flex",
    gap: 8,
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
              if (e.key === "Enter") send();
            }}
            disabled={loading}
          />

          <button
            type="button"
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={loading || isTranscribing}
            title={isRecording ? "Nagrywam..." : "Przytrzymaj, aby mówić"}
            aria-label={isRecording ? "Nagrywanie" : "Naciśnij i przytrzymaj, aby nagrywać"}
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

          <button onClick={send} disabled={loading || isRecording || isTranscribing} type="button">
            {loading ? "..." : "Wyślij"}
          </button>
        </div>

        {isRecording || isTranscribing || sttError ? (
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
            {isRecording ? "Nagrywam... (puść przycisk, aby zakończyć)" : null}
            {isTranscribing ? " Transcribing..." : null}
            {sttError ? ` STT error: ${sttError}` : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
