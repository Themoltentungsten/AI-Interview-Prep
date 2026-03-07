import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  const { text, voice } = await req.json();

  if (!text) return NextResponse.json({ error: "No text provided" }, { status: 400 });

  const response = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: voice || "alloy",
    input: text,
  });

  const audioData = Buffer.from(await response.arrayBuffer());
  return new Response(audioData, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}