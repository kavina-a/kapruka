"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { useRukaChat } from "./ChatContext";
import { Message } from "./Message";
import { Composer } from "./Composer";
import { ActiveGiftMessageBar } from "@/components/gift-message/GiftMessageCard";
import { ChatRukaLogo } from "@/components/brand/ChatRukaLogo";
import { RukaAvatar } from "@/components/brand/RukaAvatar";
import { useCommerce } from "@/lib/commerce/store";
import type { VoiceEntry } from "@/lib/commerce/store";
import { buildThread } from "@/lib/chat/buildThread";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ProductCarousel } from "@/components/products/ProductCarousel";
import { GiftFinderCard } from "@/components/chat/GiftFinderCard";
import type { GiftFinderState } from "@/lib/catalog/gift-finder-types";
import { GIFT_RELATIONSHIPS_BY_ID } from "@/lib/catalog/gift-relationships";

function colomboHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Colombo",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10,
  );
}

function timeGreeting(): string {
  const h = colomboHour();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function TypingRow() {
  return (
    <div className="flex items-center gap-3">
      <RukaAvatar size={32} className="shrink-0" thinking />
      <div className="flex items-center gap-1.5">
        <span className="typing-dot size-2 rounded-full bg-gold-400" />
        <span className="typing-dot size-2 rounded-full bg-gold-400" style={{ animationDelay: "0.2s" }} />
        <span className="typing-dot size-2 rounded-full bg-gold-400" style={{ animationDelay: "0.4s" }} />
      </div>
    </div>
  );
}

function VoiceMessage({ entry }: { entry: VoiceEntry }) {
  const isUser = entry.role === "user";
  const partial = !entry.final;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className={cn(
            "max-w-[82%] rounded-3xl rounded-br-lg bg-brand-700 px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-sm",
            partial && "opacity-80",
          )}
        >
          {entry.text}
          {partial && <span className="ml-1 inline-block animate-pulse">…</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <RukaAvatar size={34} className="mt-0.5 shrink-0" glow={partial} />
      <div
        className={cn(
          "max-w-[82%] rounded-3xl rounded-bl-lg border border-line bg-canvas-2 px-4 py-2.5 text-[15px] leading-relaxed text-ink shadow-sm",
          partial && "text-ink-muted opacity-90",
        )}
      >
        {entry.text}
        {partial && <span className="ml-1 inline-block animate-pulse">…</span>}
      </div>
    </div>
  );
}

function Greeting() {
  const name = useCommerce((s) => s.userProfile.name);
  const { t } = useT();

  const greet = timeGreeting();
  const headline = name ? `${greet}, ${name}` : greet;

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-4 sm:px-5">
      <div className="w-full max-w-xl py-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 flex justify-center"
        >
          <ChatRukaLogo height={48} className="h-11 sm:h-12" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.06 }}
          className="text-center font-display text-3xl leading-tight text-ink sm:text-4xl"
        >
          {headline}
        </motion.h1>

        <div className="mt-6" data-drop-zone="composer">
          <Composer autoFocus />
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="mt-3 text-center text-sm italic tracking-wide text-ink-muted/80"
          >
            {t("composerTagline")}
          </motion.p>
        </div>
      </div>
    </div>
  );
}

/** Warm spoken line Ruka says before showing the picker chips. */
function rukaPickerIntro(prefill: Partial<GiftFinderState> | null): string {
  const relId = prefill?.relationship;
  const rel = relId ? GIFT_RELATIONSHIPS_BY_ID[relId] : null;
  if (rel) {
    const about =
      relId === "father"
        ? "him"
        : relId === "mother"
          ? "her"
          : "them";
    return `No worries — a couple of quick things about ${about} and I'll pull ideas that actually fit.`;
  }
  return `No worries — tell me a little about them and I'll pull ideas that actually fit.`;
}

/** Category picker surfaced mid-conversation when the buyer is stuck. */
function GiftFinderInline({
  submitGiftFinderPicks,
}: {
  submitGiftFinderPicks: (state: GiftFinderState) => void;
}) {
  const closeGiftFinder = useCommerce((s) => s.closeGiftFinder);
  const prefill = useCommerce((s) => s.giftFinderPrefill);
  const setGiftFinderPrefill = useCommerce((s) => s.setGiftFinderPrefill);

  const handleComplete = (state: GiftFinderState) => {
    submitGiftFinderPicks(state);
  };

  const handleDismiss = () => {
    setGiftFinderPrefill(null);
    closeGiftFinder();
  };

  return (
    <div className="flex gap-3">
      <RukaAvatar size={34} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-3">
        {/* Ruka's spoken acknowledgment line */}
        <p className="text-[15px] leading-relaxed text-ink">
          {rukaPickerIntro(prefill)}
        </p>
        <GiftFinderCard
          initial={prefill ?? undefined}
          compact={Boolean(prefill?.relationship)}
          onComplete={handleComplete}
          onDismiss={handleDismiss}
        />
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { messages, status, sendText, submitGiftFinderPicks, error } = useRukaChat();
  const giftMessage = useCommerce((s) => s.giftMessage);
  const voiceOpen = useCommerce((s) => s.voiceOpen);
  const voiceMessages = useCommerce((s) => s.voiceMessages);
  const voiceProductSets = useCommerce((s) => s.voiceProductSets);
  const giftFinderOpen = useCommerce((s) => s.giftFinderOpen);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [paymentWelcome, setPaymentWelcome] = useState<string | null>(null);

  useEffect(() => {
    const ref = sessionStorage.getItem("chatruka-payment-welcome");
    if (ref) {
      sessionStorage.removeItem("chatruka-payment-welcome");
      setPaymentWelcome(ref);
    }
  }, []);

  const thread = useMemo(
    () => buildThread(messages, voiceMessages, voiceProductSets),
    [messages, voiceMessages, voiceProductSets],
  );

  const empty = thread.length === 0;
  const showGreeting = empty && !voiceOpen;

  const showTyping =
    status === "submitted" ||
    (status === "streaming" && messages[messages.length - 1]?.role === "user");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread, status, voiceOpen, giftFinderOpen]);

  return (
    <div className="flex h-full flex-col">
      {showGreeting ? (
        <Greeting />
      ) : (
        <div className="scroll-soft flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6 sm:px-6">
            {paymentWelcome && (
              <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-ink">
                Welcome back — payment received for order{" "}
                <span className="font-medium text-brand-400">{paymentWelcome}</span>. Your
                conversation picks up right where you left off.
              </div>
            )}
            {thread.map((item) => {
              if (item.type === "text") {
                return <Message key={item.key} message={item.message} />;
              }
              if (item.type === "voice-products") {
                return (
                  <div key={item.key} className="flex gap-3">
                    <RukaAvatar size={34} className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <ProductCarousel
                        products={item.productSet.products}
                        note={item.productSet.note}
                        source={item.productSet.source}
                      />
                    </div>
                  </div>
                );
              }
              return <VoiceMessage key={item.key} entry={item.entry} />;
            })}

            {giftFinderOpen && <GiftFinderInline submitGiftFinderPicks={submitGiftFinderPicks} />}

            {showTyping && <TypingRow />}

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
                ChatRuka had trouble responding. Please try again.
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>
      )}

      {(voiceOpen || !empty) && (
        <div className="border-t border-line bg-canvas px-3 py-3 pb-safe sm:px-6">
          <div className="mx-auto max-w-2xl space-y-2" data-drop-zone="composer">
            {voiceOpen && (
              <div
                id="voice-composer-mount"
                className="rounded-xl border border-brand-200/40 bg-brand-50/50 px-3 py-1.5"
              />
            )}
            {giftMessage.trim() && (
              <ActiveGiftMessageBar
                onTweak={() =>
                  sendText(
                    `Can you tweak the gift message? Right now it says: "${giftMessage.trim()}". I'd like something a bit different.`,
                  )
                }
              />
            )}
            <Composer />
          </div>
        </div>
      )}
    </div>
  );
}
