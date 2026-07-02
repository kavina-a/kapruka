"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

export type InfoKey = "how" | "privacy" | "terms";

export const INFO_CONTENT: Record<InfoKey, { title: string; body: ReactNode }> = {
  how: {
    title: "How ChatRuka works",
    body: (
      <>
        <p>
          Tell ChatRuka who you&apos;re gifting and the occasion — by chat or by voice, in
          English or Sinhala. ChatRuka searches Kapruka&apos;s real catalogue, suggests a
          shortlist with a note on each pick, and gathers them in the panel beside the
          conversation.
        </p>
        <p>
          When you&apos;re ready, ChatRuka checks live stock and price, quotes delivery to
          any town on the island, and hands you a secure Kapruka pay link. After payment,
          you can track the order right here.
        </p>
      </>
    ),
  },
  privacy: {
    title: "Privacy",
    body: (
      <>
        <p>
          Your basket, delivery details and saved recipients live only in this browser
          (localStorage) — they aren&apos;t sent to any ChatRuka account, because there
          isn&apos;t one.
        </p>
        <p>
          Payment and card details are handled entirely on Kapruka&apos;s secure checkout.
          ChatRuka never sees or stores them. Clearing your browser data removes everything
          ChatRuka kept.
        </p>
      </>
    ),
  },
  terms: {
    title: "Terms",
    body: (
      <>
        <p>
          ChatRuka is a conversational concierge in front of Kapruka. Products, prices,
          stock, delivery and fulfilment are Kapruka&apos;s; orders and payments complete on
          kapruka.com under Kapruka&apos;s terms.
        </p>
        <p>
          ChatRuka does its best to keep information accurate in real time, but the final,
          binding details are always those shown on Kapruka&apos;s checkout.
        </p>
      </>
    ),
  },
};

export function AppInfoModal({ info, onClose }: { info: InfoKey | null; onClose: () => void }) {
  useEffect(() => {
    if (!info) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [info, onClose]);

  const content = info ? INFO_CONTENT[info] : null;

  return (
    <AnimatePresence>
      {content && (
        <div className="fixed inset-0 z-70 grid place-items-end p-0 sm:place-items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-ink/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative z-10 max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-line bg-canvas p-6 shadow-xl sm:rounded-3xl pb-safe"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="font-display text-lg text-ink">{content.title}</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="grid size-10 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-canvas-3"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-ink-muted">{content.body}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
