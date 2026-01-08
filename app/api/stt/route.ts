import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GG_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Brakuje klucza API (GG_OPENAI_API_KEY lub OPENAI_API_KEY)." },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });

    const result = await client.audio.transcriptions.create({
      model: "gpt-4o-mini-transcribe",
      file,
      language: "en",
      prompt:
        "This is an English learner speaking. Keep punctuation. Prefer common English words.",
    });

    return NextResponse.json({ text: (result.text ?? "").trim() });
  } catch (e: any) {
    return NextResponse.json(
      { error: "STT failed", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
