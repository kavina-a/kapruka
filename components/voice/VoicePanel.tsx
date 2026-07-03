"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Mic, MicOff, PhoneOff, X, Loader2, Sparkles } from "lucide-react";
import {
  usePipecatClient,
  usePipecatClientMicControl,
  usePipecatClientTransportState,
  usePipecatConversation,
} from "@pipecat-ai/client-react";
import { RTVIEvent, useRTVIClientEvent } from "@/lib/voice/rtvi";
import { connectVoice } from "@/lib/voice/connect";
import { useCommerce } from "@/lib/commerce/store";
import { ProductCard } from "@/components/products/ProductCard";
import { BrandMascot } from "@/components/brand/BrandMascot";
import { VoiceOrb } from "@/components/voice/VoiceOrb";
import { resolveVoiceOrbState } from "@/lib/voice/orb-state";
import { cn } from "@/lib/utils";

type Speaker = "bot" | "user" | null;

const CONNECTING_STATES = ["authenticating", "authorizing", "connecting", "initializing"];

function partToText(text: unknown): string {
  if (typeof text === "string") return text;
  if (text && typeof text === "object") {
    const o = text as { spoken?: string; unspoken?: string };
    return o.spoken || o.unspoken || "";
  }
  return "";
}

export function VoicePanel() {
  const voiceOpen = useCommerce((s) => s.voiceOpen);
  const closeVoice = useCommerce((s) => s.closeVoice);
  const activeSet = useCommerce((s) => s.activeSet);

  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();
  const { enableMic, isMicEnabled } = usePipecatClientMicControl();
  const { messages } = usePipecatConversation();

  const [speaker, setSpeaker] = useState<Speaker>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const connected = transportState === "connected" || transportState === "ready";
  const connecting = starting || CONNECTING_STATES.includes(transportState);

  useRTVIClientEvent(RTVIEvent.BotStartedSpeaking, useCallback(() => setSpeaker("bot"), []));
  useRTVIClientEvent(RTVIEvent.BotStoppedSpeaking, useCallback(() => setSpeaker(null), []));
  useRTVIClientEvent(RTVIEvent.UserStartedSpeaking, useCallback(() => setSpeaker("user"), []));
  useRTVIClientEvent(RTVIEvent.UserStoppedSpeaking, useCallback(() => setSpeaker(null), []));

  // Keep the transcript scrolled to the latest line.
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const start = useCallback(async () => {
    if (!client) return;
    setError(null);
    setStarting(true);
    try {
      await connectVoice(client);
    } catch (err) {
      setError(
        "I couldn't reach the voice line. Make sure the voice service is running, then try again.",
      );
      console.error("Voice connect failed:", err);
    } finally {
      setStarting(false);
    }
  }, [client]);

  const hangUp = useCallback(async () => {
    try {
      await client?.disconnect();
    } catch {
      // ignore — we're tearing down anyway
    }
  }, [client]);

  const end = useCallback(async () => {
    await hangUp();
    closeVoice();
  }, [hangUp, closeVoice]);

  // If the overlay unmounts while still connected, clean up the call.
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
        ? "Tap to start the call"
        : speaker === "bot"
          ? "ChatRuka is speaking…"
          : speaker === "user"
            ? "Listening…"
            : "Go ahead — I'm listening";

  // Last few non-empty turns for a glanceable transcript.
  const turns = messages
    .map((m) => ({ role: m.role, text: m.parts.map((p) => partToText(p.text)).join("").trim() }))
    .filter((t) => t.text.length > 0)
    .slice(-6);

  const products = activeSet?.products ?? [];
  const orbState = resolveVoiceOrbState({ connected, connecting, speaker });

  return (
    <AnimatePresence>
      {voiceOpen && (
        <motion.div
          className="app-backdrop fixed inset-0 z-40 flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line bg-canvas px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2.5">
              <BrandMascot variant="call" size={34} />
              <div className="leading-tight">
                <div className="font-display text-base text-ink">Calling ChatRuka</div>
                <div className="text-[11px] text-ink-faint">Live voice · English · Sinhala · Tanglish</div>
              </div>
            </div>
            <button
              onClick={end}
              aria-label="Close voice"
              className="grid size-10 place-items-center rounded-full bg-canvas-2 text-ink-muted ring-1 ring-line transition hover:bg-canvas-3 hover:text-ink"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Stage */}
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-5 py-6">
            {/* Mic orb */}
            <div className="relative grid place-items-center">
              <VoiceOrb state={orbState} size={152} label={statusLabel} />
              {connecting && (
                <span className="pointer-events-none absolute inset-0 grid place-items-center">
                  <Loader2 className="size-8 animate-spin text-brand-500/70" aria-hidden />
                </span>
              )}
            </div>

            <div className="text-center">
              <p className="font-display text-lg text-ink">{statusLabel}</p>
              {error && <p className="mt-1 max-w-sm text-sm text-rose-300">{error}</p>}
              {!connected && !connecting && !error && (
                <p className="mt-1 max-w-sm text-sm text-ink-muted">
                  Tell me who you&apos;re gifting — I&apos;ll show options on screen as we talk.
                </p>
              )}
            </div>

            {/* Transcript */}
            {turns.length > 0 && (
              <div
                ref={transcriptRef}
                className="scroll-soft max-h-40 w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-canvas-2 p-3"
              >
                <div className="flex flex-col gap-2">
                  {turns.map((t, i) => (
                    <div
                      key={i}
                      className={cn(
                        "text-sm leading-snug",
                        t.role === "user" ? "text-ink-muted" : "text-ink",
                      )}
                    >
                      <span
                        className={cn(
                          "mr-1.5 text-[11px] font-semibold uppercase tracking-wide",
                          t.role === "user" ? "text-ink-faint" : "text-gold-300",
                        )}
                      >
                        {t.role === "user" ? "You" : "ChatRuka"}
                      </span>
                      {t.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Product strip — voice-surfaced gifts, fully interactive */}
          {products.length > 0 && (
            <div className="border-t border-line bg-canvas px-4 py-3 sm:px-6">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-ink-muted">
                <Sparkles className="size-3.5 text-gold-400" />
                {activeSet?.title ?? "On your screen"}
                <span className="text-ink-faint">· tap to view or add</span>
              </div>
              <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
                {products.slice(0, 12).map((p) => (
                  <div key={p.id} className="w-36 shrink-0 sm:w-40">
                    <ProductCard product={p} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-4 border-t border-line bg-canvas px-4 py-4">
            {!connected ? (
              <button
                onClick={start}
                disabled={connecting}
                className="inline-flex items-center gap-2 rounded-full bg-gold-500 px-6 py-3 font-semibold text-ink-dark transition enabled:hover:bg-gold-400 disabled:opacity-50"
              >
                {connecting ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
                {connecting ? "Connecting" : "Start call"}
              </button>
            ) : (
              <>
                <button
                  onClick={() => enableMic(!isMicEnabled)}
                  className={cn(
                    "grid size-12 place-items-center rounded-full ring-1 transition",
                    isMicEnabled
                      ? "bg-canvas-2 text-ink ring-line hover:bg-canvas-3"
                      : "bg-rose-500/20 text-rose-300 ring-rose-500/40",
                  )}
                  aria-label={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
                >
                  {isMicEnabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
                </button>
                <button
                  onClick={end}
                  className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-6 py-3 font-semibold text-white transition hover:bg-rose-400"
                >
                  <PhoneOff className="size-5" /> End call
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
