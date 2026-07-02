"use client";

import { useState, type ComponentProps } from "react";
import { PipecatClientAudio, PipecatClientProvider } from "@pipecat-ai/client-react";
import { createVoiceClient } from "@/lib/voice/client";
import { VoiceBridge } from "./VoiceBridge";
import { VoiceComposer } from "./VoiceComposer";

type ProviderClient = ComponentProps<typeof PipecatClientProvider>["client"];

/**
 * The self-contained voice layer: owns the Pipecat client, bridges server
 * messages into the store, renders the inline VoiceComposer (portal-based,
 * mounts inside ChatPanel's composer slot), and plays bot audio.
 * Loaded client-only (next/dynamic, ssr:false) because the WebRTC libraries
 * are browser-only.
 */
export function VoiceLayer() {
  const [client] = useState(() => createVoiceClient());

  return (
    <PipecatClientProvider client={client as unknown as ProviderClient}>
      <VoiceBridge />
      <VoiceComposer />
      <PipecatClientAudio />
    </PipecatClientProvider>
  );
}
