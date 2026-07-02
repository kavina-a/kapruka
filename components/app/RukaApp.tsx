"use client";

import dynamic from "next/dynamic";
import { ChatProvider } from "@/components/chat/ChatContext";
import { AppShell } from "./AppShell";
import { TrackDrawer } from "@/components/track/TrackDrawer";

// The voice layer pulls in browser-only WebRTC libraries — load client-side only.
const VoiceLayer = dynamic(
  () => import("@/components/voice/VoiceLayer").then((m) => m.VoiceLayer),
  { ssr: false },
);

export function RukaApp() {
  return (
    <ChatProvider>
      <AppShell />
      <TrackDrawer />
      <VoiceLayer />
    </ChatProvider>
  );
}
