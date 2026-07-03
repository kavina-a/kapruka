"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Mic, MicOff, PhoneOff, Loader2 } from "lucide-react";
import {
  usePipecatClient,
  usePipecatClientMicControl,
  usePipecatClientTransportState,
} from "@pipecat-ai/client-react";
import { RTVIEvent, useRTVIClientEvent } from "@/lib/voice/rtvi";
import { connectVoice } from "@/lib/voice/connect";
import { useCommerce } from "@/lib/commerce/store";
import { VoiceOrb } from "@/components/voice/VoiceOrb";
import { resolveVoiceOrbState } from "@/lib/voice/orb-state";
import { cn } from "@/lib/utils";

type Speaker = "bot" | "user" | null;

const CONNECTING_STATES = ["authenticating", "authorizing", "connecting", "initializing"];

/**
 * Inline voice input widget — renders via a React portal into the
 * `#voice-composer-mount` element that ChatPanel places where the text
 * composer normally lives. Must be mounted inside PipecatClientProvider.
 */
export function VoiceComposer() {
  const voiceOpen = useCommerce((s) => s.voiceOpen);
  const closeVoice = useCommerce((s) => s.closeVoice);

  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();
  const { enableMic, isMicEnabled } = usePipecatClientMicControl();

  const [speaker, setSpeaker] = useState<Speaker>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [domReady, setDomReady] = useState(false);

  // createPortal requires the DOM to be available.
  useEffect(() => { setDomReady(true); }, []);

  const connected = transportState === "connected" || transportState === "ready";
  const connecting = starting || CONNECTING_STATES.includes(transportState);

  useRTVIClientEvent(RTVIEvent.BotStartedSpeaking, useCallback(() => setSpeaker("bot"), []));
  useRTVIClientEvent(RTVIEvent.BotStoppedSpeaking, useCallback(() => setSpeaker(null), []));
  useRTVIClientEvent(RTVIEvent.UserStartedSpeaking, useCallback(() => setSpeaker("user"), []));
  useRTVIClientEvent(RTVIEvent.UserStoppedSpeaking, useCallback(() => setSpeaker(null), []));

  const handleStart = useCallback(async () => {
    if (!client) return;
    setError(null);
    setStarting(true);
    try {
      await connectVoice(client);
    } catch (err) {
      setError("Couldn't reach the voice line. Tap to try again.");
      console.error("Voice connect failed:", err);
    } finally {
      setStarting(false);
    }
  }, [client]);

  // Auto-connect when voice opens and we haven't connected yet.
  useEffect(() => {
    if (voiceOpen && !connected && !connecting && client) {
      handleStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceOpen]);

  const end = useCallback(async () => {
    try {
      await client?.disconnect();
    } catch {
      // ignore — tearing down anyway
    }
    closeVoice();
  }, [client, closeVoice]);

  // Disconnect if VoiceComposer unmounts while still in a call.
  useEffect(() => {
    return () => {
      if (client && (client.connected || client.state === "ready")) {
        client.disconnect().catch(() => {});
      }
    };
  }, [client]);

  const statusLabel = error
    ? "Tap to try again"
    : connecting
      ? "Connecting…"
      : !connected
        ? "Starting…"
        : speaker === "bot"
          ? "ChatRuka is speaking…"
          : speaker === "user"
            ? "Listening…"
            : "Speak, or type a message below";

  const orbState = resolveVoiceOrbState({ connected, connecting, speaker });

  if (!domReady || !voiceOpen) return null;

  const target = document.getElementById("voice-composer-mount");
  if (!target) return null;

  return createPortal(
    <div className="flex items-center gap-3 py-1">
      <div className="relative shrink-0">
        <VoiceOrb state={orbState} size={44} label={statusLabel} />
        {connecting && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <Loader2 className="size-4 animate-spin text-brand-600/80" aria-hidden />
          </span>
        )}
      </div>

      {/* Status */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{statusLabel}</p>
        {error && <p className="mt-0.5 text-xs text-rose-500">{error}</p>}
      </div>

      {/* Controls */}
      {connected ? (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => enableMic(!isMicEnabled)}
            className={cn(
              "grid size-11 place-items-center rounded-full ring-1 transition",
              isMicEnabled
                ? "bg-canvas-2 text-ink ring-line hover:bg-canvas-3"
                : "bg-rose-500/15 text-rose-400 ring-rose-500/40",
            )}
            aria-label={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
          >
            {isMicEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
          </button>
          <button
            onClick={end}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-rose-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-400"
          >
            <PhoneOff className="size-3.5" />
            <span className="hidden sm:inline">End call</span>
            <span className="sm:hidden">End</span>
          </button>
        </div>
      ) : (
        <button
          onClick={error ? handleStart : undefined}
          disabled={connecting && !error}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white transition enabled:hover:bg-brand-400 disabled:opacity-50"
        >
          {connecting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Mic className="size-3.5" />
          )}
          {connecting ? "Connecting…" : "Start"}
        </button>
      )}
    </div>,
    target,
  );
}
