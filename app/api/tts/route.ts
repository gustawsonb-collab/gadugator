import OpenAI from "openai";

export const runtime = "nodejs";

type TTSVoice =
  | "alloy"
  | "ash"
  | "ballad"
  | "coral"
  | "echo"
  | "fable"
  | "nova"
  | "onyx"
  | "sage"
  | "shimmer"
  | "verse"
  | "marin"
  | "cedar";

function safeTrim(x: unknown, fallback = "") {
  if (typeof x !== "string") return fallback;
  const t = x.trim();
  return t.length ? t : fallback;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GG_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "Brakuje klucza API. Ustaw GG_OPENAI_API_KEY w .env.local (lub OPENAI_API_KEY).",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => null);

    const text = safeTrim(body?.text, "");
    const voice = (safeTrim(body?.voice, "marin") as TTSVoice) || "marin";

    const input = text.slice(0, 900);
    if (!input) {
      return new Response(JSON.stringify({ error: "Brak tekstu do TTS." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const client = new OpenAI({ apiKey });

    const mp3 = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input,
      instructions:
        "Speak clearly, friendly, natural. Moderate pace. Slightly warm tutor tone. Avoid robotic cadence.",
      response_format: "mp3",
    });

    // ✅ Bez Buffer (najbardziej kompatybilne z Next/Turbopack)
    const ab = await mp3.arrayBuffer();
    const bytes = new Uint8Array(ab);

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    return new Response(JSON.stringify({ error: "TTS error: " + msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
