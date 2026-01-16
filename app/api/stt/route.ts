import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function jsonError(message: string, status = 500, details?: any) {
  return NextResponse.json(
    { error: message, ...(details ? { details } : {}) },
    { status }
  );
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GG_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) return jsonError("Brakuje klucza API (GG_OPENAI_API_KEY lub OPENAI_API_KEY).", 500);

    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return jsonError("Missing audio file (field: file).", 400);
    }

    // Edge czasem wysyła plik 0B jeśli nagrywanie zostało przerwane
    if (!file.size || file.size < 800) {
      return jsonError("Audio file is empty/too short. Try speaking a bit longer.", 400, {
        size: file.size,
        type: file.type,
      });
    }

    // Bezpieczny limit (możesz zmienić)
    const MAX_BYTES = 12 * 1024 * 1024; // 12MB
    if (file.size > MAX_BYTES) {
      return jsonError("Audio file is too large.", 413, { size: file.size, max: MAX_BYTES });
    }

    // Wymuś sensowną nazwę i typ – pomaga przy webm/opus
    const contentType = file.type || "audio/webm";
    const filename =
      file.name && file.name.includes(".") ? file.name : `speech.${contentType.includes("webm") ? "webm" : "wav"}`;

    const normalized = new File([file], filename, { type: contentType });

    const client = new OpenAI({ apiKey });

    const result = await client.audio.transcriptions.create({
      model: "gpt-4o-mini-transcribe",
      file: normalized,
      language: "en",
      prompt: "This is an English learner speaking. Keep punctuation. Prefer common English words.",
    });

    const text = String((result as any)?.text ?? "").trim();
    return NextResponse.json({ text });
  } catch (e: any) {
    // Tu dostaniesz konkretniejszy błąd w UI
    const msg = typeof e?.message === "string" ? e.message : String(e);
    return jsonError("STT failed", 500, msg);
  }
}
