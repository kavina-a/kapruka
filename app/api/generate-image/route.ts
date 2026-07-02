import { openai } from "@ai-sdk/openai";
import { generateImage } from "ai";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes("REPLACE_ME")) {
    return Response.json({ error: "OpenAI not configured." }, { status: 503 });
  }

  let description = "";
  let purpose = "";
  try {
    const body = await req.json();
    description = body.description ?? "";
    purpose = body.purpose ?? "";
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!description.trim()) {
    return Response.json({ error: "description is required." }, { status: 400 });
  }

  const prompt = [
    `A clean, well-lit product photograph of: ${description}.`,
    purpose ? `It is meant for: ${purpose}.` : "",
    "White or neutral background, studio lighting, no people, no text overlays.",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    // gpt-image-1 returns base64 by default; dall-e-3 rejects response_format on the current API.
    const imageModel = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
    const result = await generateImage({
      model: openai.imageModel(imageModel),
      prompt,
      size: "1024x1024",
    });

    // The image comes back as base64 — convert to a data URL the browser can render
    const base64 = result.image.base64;
    const imageUrl = `data:image/png;base64,${base64}`;

    return Response.json({ ok: true, imageUrl });
  } catch (err) {
    console.error("[/api/generate-image]", err);
    const msg = err instanceof Error ? err.message : "Image generation failed.";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
