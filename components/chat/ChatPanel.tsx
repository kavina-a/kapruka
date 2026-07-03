"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { useRukaChat } from "./ChatContext";
import { Message } from "./Message";
import { Composer } from "./Composer";
import { ActiveGiftMessageBar } from "@/components/gift-message/GiftMessageCard";
import { BrandMascot } from "@/components/brand/BrandMascot";
import { RukaAvatar } from "@/components/brand/RukaAvatar";
import { OCCASIONS } from "@/lib/catalog/occasions";
import { useCommerce } from "@/lib/commerce/store";
import type { VoiceEntry } from "@/lib/commerce/store";
import { buildThread } from "@/lib/chat/buildThread";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ProductCarousel } from "@/components/products/ProductCarousel";

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

const QUICK_IDS = ["birthday", "romance", "mother", "cakes", "flowers", "newborn", "chocolates", "jewellery"];

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

/** Voice transcript bubble — matches text chat layout; shows live partials while speaking. */
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

function Greeting({ sendText }: { sendText: (t: string) => void }) {
  const openVoice = useCommerce((s) => s.openVoice);
  const name = useCommerce((s) => s.userProfile.name);
  const { t } = useT();
  const quickOccasions = OCCASIONS.filter((o) => QUICK_IDS.includes(o.id));

  const greet = timeGreeting();
  const headline = name ? `${greet}, ${name}` : greet;
  // const subtext = name
  //   ? `Who are we gifting today? Tell me the occasion and I'll find something that actually lands.`
  //   : `Tell me who it's for and the occasion — I'll find something that lands, then take you to checkout anywhere in Sri Lanka.`;

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-4 sm:px-5">
      <div className="w-full max-w-xl py-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 flex justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="ChatRuka"
            className="h-11 w-auto object-contain sm:h-12"
            draggable={false}
          />
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

        <div className="mt-3 flex justify-center">
          {/* <button
            onClick={openVoice}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-brand-300/40 bg-brand-100/60 px-4 py-2.5 text-sm font-medium text-brand-600 transition hover:bg-brand-100"
          >
            <BrandMascot variant="call" size={28} />
            <span className="sm:hidden">Call ChatRuka</span>
          </button> */}
        </div>
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { messages, status, sendText, error } = useRukaChat();
  const giftMessage = useCommerce((s) => s.giftMessage);
  const voiceOpen = useCommerce((s) => s.voiceOpen);
  const voiceMessages = useCommerce((s) => s.voiceMessages);
  const voiceProductSets = useCommerce((s) => s.voiceProductSets);
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
  }, [thread, status, voiceOpen]);

  return (
    <div className="flex h-full flex-col">
      {showGreeting ? (
        <Greeting sendText={sendText} />
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
