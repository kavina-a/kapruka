import { createVoiceClient } from "@/lib/voice/client";
import { useCommerce } from "@/lib/commerce/store";

/**
 * Downscale an image file to a compact JPEG data URL. Voice images travel over
 * the WebRTC data channel (which caps individual messages at a few hundred KB)
 * and then to a vision model, so we cap the longest edge and re-encode to keep
 * the payload small and reliable.
 */
export async function fileToCompactDataUrl(
  file: File,
  maxDim = 1024,
  quality = 0.72,
): Promise<string> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = bitmapUrl;
    });

    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      // Canvas unavailable — fall back to the raw file as a data URL.
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

/**
 * Send a dropped/attached image to the live voice agent.
 *
 * Renders the image immediately as a user bubble in the shared thread, then
 * pushes it to the Pipecat server over the RTVI data channel as a
 * `user_image` client message. The server appends it to the LLM context and
 * runs a turn, so Ruka "sees" the image and answers by voice — the same brain
 * that's already on the call.
 *
 * Returns false when there is no connected voice session to send to.
 */
export async function sendVoiceImage(file: File, prompt?: string): Promise<boolean> {
  if (!file.type.startsWith("image/")) return false;

  const client = createVoiceClient();
  const connected = client.connected || client.state === "ready";
  if (!connected) return false;

  const dataUrl = await fileToCompactDataUrl(file);
  const trimmedPrompt = prompt?.trim() || "";

  // Show the caller's image in the thread right away.
  useCommerce.getState().mergeVoiceTranscript([
    {
      id: `voice-user-image-${Date.now()}`,
      role: "user",
      text: trimmedPrompt,
      imageUrl: dataUrl,
      final: true,
      createdAt: new Date().toISOString(),
    },
  ]);

  const spokenHint =
    trimmedPrompt ||
    "I'm sharing an image with you. Take a look and help me find something like it.";

  client.sendClientMessage("user_image", {
    url: dataUrl,
    prompt: spokenHint,
  });

  return true;
}
