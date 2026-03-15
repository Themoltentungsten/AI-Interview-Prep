import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  const { text, voice } = await req.json();

  if (!text) return NextResponse.json({ error: "No text provided" }, { status: 400 });

  try {
    // Prefer gpt-4o-mini-tts; fallback to tts-1-hd for compatibility
    const models = ["gpt-4o-mini-tts", "tts-1-hd"];
    let lastError: unknown;

    for (const model of models) {
      try {
        const response = await client.audio.speech.create({
          model,
          voice: voice || "alloy",
          input: text,
        });

        const audioData = Buffer.from(await response.arrayBuffer());
        return new Response(audioData, {
          headers: { "Content-Type": "audio/mpeg" },
        });
      } catch (err) {
        lastError = err;
        continue;
      }
    }

    throw lastError;
  } catch (err) {
    console.error("[TTS] Error:", err);
    return NextResponse.json(
      { error: "Text-to-speech failed. Check OPENAI_API_KEY." },
      { status: 500 }
    );
  }
}