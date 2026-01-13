import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Roles that we accept from the frontend */
type Role = "system" | "user" | "assistant";

/** Incoming OpenAI-style message */
type IncomingMessage = { role: Role; content: string };

/** Your app modes (keep compatible with existing frontend) */
type Mode = "tutor" | "chat";

/** CEFR levels used in the app */
type Level = "A1" | "A2" | "B1" | "B2" | "C1";

/** Session preferences coming from the session modal */
type SessionPrefs = {
  level?: Level;
  topic?: string;
  style?: "formal" | "casual" | "humorous";
  motivationalMode?: boolean;
};

type Feedback = {
  corrected: string;
  tips: string[];
  alternatives: string[];
};

function safeTrim(x: unknown, fallback: string) {
  if (typeof x !== "string") return fallback;
  const t = x.trim();
  return t.length ? t : fallback;
}

function buildSystemPrompt(params: {
  levelFromBody: Level;
  modeFromBody: Mode;
  sessionPrefs: SessionPrefs | null;
}) {
  const { levelFromBody, modeFromBody, sessionPrefs } = params;

  // sessionPrefs can override level from body (modal has priority)
  const level: Level = sessionPrefs?.level ?? levelFromBody ?? "B1";

  const topic = safeTrim(sessionPrefs?.topic, "daily life");
  const style = sessionPrefs?.style ?? "casual";
  const motivationalMode = !!sessionPrefs?.motivationalMode;

  // Build prompt safely (no backticks issues)
  const base = [
    "You are GaduGator, an English conversation tutor.",
    "",
    "CRITICAL RULE: Always reply in ENGLISH only.",
    "Even if the user writes in Polish, answer in English (simple English appropriate for the chosen level).",
    "",
    `User level: ${level}. Adapt vocabulary, sentence length, and complexity to this level.`,
    `Conversation topic: ${topic}. Stay within this topic unless the user changes it.`,
    `Style: ${style}. Keep this tone consistent.`,
    "",
    "Always ask ONE question at a time.",
    "Keep responses concise and practical.",
    "",
    "MINI-FEEDBACK:",
    "After reading the user's last message, provide gentle corrections and 1–2 better alternative sentences.",
    "If the user's message is already correct or too short to correct, set corrected to an empty string.",
    "",
    "OUTPUT FORMAT (CRITICAL):",
    "Return ONLY valid JSON (no markdown, no extra text). Make sure the JSON is parseable (escape quotes inside strings).",
    "Return exactly this shape:",
    "{",
    '  "reply": "your normal assistant reply in English",',
    '  "feedback": {',
    '    "corrected": "a corrected version of the user\'s last message (or empty string if no correction needed)",',
    '    "tips": ["1 short tip", "optional second short tip"],',
    '    "alternatives": ["1 alternative sentence", "optional second alternative sentence"]',
    "  }",
    "}",
  ].join("\n");

  // Keep mode instructions, but do NOT contradict JSON format.
  const modeInstruction =
    modeFromBody === "tutor"
      ? [
          "MODE: tutor",
          "Be patient and supportive.",
          "In feedback.tips, keep tips short (max 1 line each).",
        ].join("\n")
      : [
          "MODE: chat",
          "Focus on natural conversation while staying within the level and one-question-at-a-time rule.",
        ].join("\n");

  const motivational = motivationalMode
    ? [
        "MOTIVATIONAL MODE: ON",
        "Be extra friendly, praise effort often, keep answers short, and reduce pressure.",
        "Keep feedback gentle and encouraging.",
      ].join("\n")
    : "";

  return [base, modeInstruction, motivational].filter(Boolean).join("\n\n");
}

function isIncomingMessage(x: any): x is IncomingMessage {
  return (
    x &&
    typeof x === "object" &&
    (x.role === "user" || x.role === "assistant" || x.role === "system") &&
    typeof x.content === "string"
  );
}

function safeParseAssistantJSON(raw: string): { reply: string; feedback?: Feedback } | null {
  try {
    const trimmed = raw.trim();

    // 1) Try direct parse first
    try {
      const direct = JSON.parse(trimmed);

      if (direct && typeof direct === "object") {
        const reply = typeof (direct as any).reply === "string" ? (direct as any).reply : "";
        const fb = (direct as any).feedback;

        let feedback: Feedback | undefined;

        if (fb && typeof fb === "object") {
          const corrected = typeof fb.corrected === "string" ? fb.corrected : "";
          const tips = Array.isArray(fb.tips)
            ? fb.tips.filter((t: any) => typeof t === "string")
            : [];
          const alternatives = Array.isArray(fb.alternatives)
            ? fb.alternatives.filter((t: any) => typeof t === "string")
            : [];

          feedback = { corrected, tips, alternatives };
        }

        return { reply, feedback };
      }
    } catch {
      // ignore and try extract below
    }

    // 2) If model returned extra text + JSON, extract the JSON object
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      const maybeJson = trimmed.slice(first, last + 1);
      const parsed = JSON.parse(maybeJson);

      if (!parsed || typeof parsed !== "object") return null;

      const reply = typeof (parsed as any).reply === "string" ? (parsed as any).reply : "";
      const fb = (parsed as any).feedback;

      let feedback: Feedback | undefined;

      if (fb && typeof fb === "object") {
        const corrected = typeof fb.corrected === "string" ? fb.corrected : "";
        const tips = Array.isArray(fb.tips)
          ? fb.tips.filter((t: any) => typeof t === "string")
          : [];
        const alternatives = Array.isArray(fb.alternatives)
          ? fb.alternatives.filter((t: any) => typeof t === "string")
          : [];

        feedback = { corrected, tips, alternatives };
      }

      return { reply, feedback };
    }

    return null;
  } catch {
    return null;
  }
}
function minimalFeedback(userText: string) {
  const u = (userText ?? "").trim();

  return {
    corrected: "",
    tips: [
      "Tip: add one short follow-up question to keep the conversation going.",
    ],
    alternatives: u
      ? [
          `Alternative: "${u}"`,
          "Alternative: try a shorter sentence + a follow-up question.",
        ]
      : [],
  };
}


export async function POST(req: Request) {
  try {
    // Use your current env var name (GG_...), but also allow OPENAI_API_KEY as fallback.
    const apiKey = process.env.GG_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Brakuje klucza API. Ustaw GG_OPENAI_API_KEY w .env.local (lub OPENAI_API_KEY jako fallback).",
        },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    const body = await req.json().catch(() => null);

    const messages = (body?.messages ?? []) as IncomingMessage[];
    const mode = (body?.mode ?? "tutor") as Mode;
    const level = (body?.level ?? "B1") as Level;

    // sessionPrefs from the session modal
    const sessionPrefs = (body?.sessionPrefs ?? null) as SessionPrefs | null;

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Invalid request: messages must be an array" },
        { status: 400 }
      );
    }

    // Filter/validate message entries to avoid runtime errors
    const cleanedMessages = messages.filter(isIncomingMessage);

    const system = buildSystemPrompt({
      levelFromBody: level,
      modeFromBody: mode,
      sessionPrefs,
    });

    const result = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: system }, ...cleanedMessages],
      temperature: 0.7,
    });

    const raw = result.choices?.[0]?.message?.content ?? "";
    const trimmed = String(raw).trim();

    // Try to parse JSON (mini-feedback). If it fails, fall back to plain text.
    const parsed = safeParseAssistantJSON(trimmed);

    if (parsed && parsed.reply) {
      return NextResponse.json({
        text: parsed.reply.trim() || "(empty reply)",
        feedback: parsed.feedback ?? null,
      });
    }

  
const lastUserText =
  [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

const fbOut = minimalFeedback(lastUserText);

console.log("CHAT RETURN:", { text: trimmed || "(empty reply)", fbOut });

    return NextResponse.json({
  text: trimmed || "(empty reply)",
  feedback: fbOut,
});

  } catch (err: any) {
    const status = Number(err?.status) || Number(err?.response?.status) || 500;
    const msg = String(err?.message ?? err);

    // 429: quota/billing/limits
    if (status === 429 || msg.toLowerCase().includes("quota")) {
      console.error("API /api/chat 429 (quota/billing):", msg);
      return NextResponse.json(
        {
          error:
            "OpenAI API: 429 (brak dostępnej kwoty/limitu). Wejdź w Billing na platform.openai.com, dodaj metodę płatności/środki i upewnij się, że projekt ma aktywny limit.",
        },
        { status: 429 }
      );
    }

    console.error("API /api/chat error:", msg);
    return NextResponse.json({ error: "Server error: " + msg }, { status });
  }
}
