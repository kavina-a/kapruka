"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BrandMascot } from "@/components/brand/BrandMascot";
import { useCommerce } from "@/lib/commerce/store";
import { useT } from "@/lib/i18n";
import { MobileMenu } from "./MobileMenu";
import { ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

function AgentCapsule({
  onCall,
  onTrack,
  callLabel,
  trackLabel,
}: {
  onCall: () => void;
  onTrack: () => void;
  callLabel: string;
  trackLabel: string;
}) {
  const segmentClass =
    "inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 px-2.5 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 active:bg-brand-100/80 sm:gap-2 sm:px-3.5";

  return (
    <div
      role="group"
      aria-label="Chat and track agents"
      className="inline-flex min-h-11 items-stretch overflow-hidden rounded-full bg-white shadow-[0_1px_8px_rgba(0,0,0,0.12)] ring-1 ring-white/90"
    >
      <button
        type="button"
        onClick={onCall}
        aria-label={callLabel}
        title={callLabel}
        className={cn(segmentClass, "rounded-l-full pr-2 sm:pr-3")}
      >
        <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-white ring-1 ring-brand-100">
          <BrandMascot variant="call" size={24} className="pointer-events-none" />
        </span>
        <span className="hidden md:inline">{callLabel}</span>
        <span className="md:hidden">Call</span>
      </button>

      <div className="my-2 w-px shrink-0 self-stretch bg-brand-200/80" aria-hidden />

      <button
        type="button"
        onClick={onTrack}
        aria-label={trackLabel}
        title={trackLabel}
        className={cn(segmentClass, "rounded-r-full pl-2 sm:pl-3")}
      >
        <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-white ring-1 ring-brand-100">
          <BrandMascot variant="track" size={24} className="pointer-events-none" />
        </span>
        <span className="hidden md:inline">{trackLabel}</span>
        <span className="md:hidden">Track</span>
      </button>
    </div>
  );
}

export function Header() {
  const openCart = useCommerce((s) => s.openCart);
  const openTrack = useCommerce((s) => s.openTrack);
  const openVoice = useCommerce((s) => s.openVoice);
  const draggedProduct = useCommerce((s) => s.draggedProduct);
  const { t } = useT();
  const count = useCommerce((s) => s.cart.reduce((n, c) => n + c.quantity, 0));

  const prevCountRef = useRef(count);
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    if (count > prevCountRef.current) {
      setBurst(true);
      const timer = setTimeout(() => setBurst(false), 500);
      prevCountRef.current = count;
      return () => clearTimeout(timer);
    }
    prevCountRef.current = count;
  }, [count]);

  const isDragging = !!draggedProduct;

  return (
    <header className="flex items-center justify-between gap-3 border-b border-brand-700/20 bg-brand-700 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="ChatRuka"
          className="h-9 w-auto object-contain"
          draggable={false}
        />
        <div className="hidden text-[11px] text-brand-300 sm:block lg:max-w-[200px] lg:truncate">
          Kapruka gift concierge
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <MobileMenu />
        <AgentCapsule
          onCall={openVoice}
          onTrack={openTrack}
          callLabel={t("callChatRuka")}
          trackLabel={t("trackOrder")}
        />

        <motion.button
          onClick={openCart}
          data-drop-zone="cart"
          aria-label="Open basket"
          animate={
            isDragging
              ? { scale: 1.08, boxShadow: "0 0 0 4px rgba(107,68,163,0.55)" }
              : { scale: 1, boxShadow: "0 0 0 0px rgba(107,68,163,0)" }
          }
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className={cn(
            "relative grid size-11 place-items-center rounded-full bg-brand-600 text-white ring-1 ring-brand-500 transition-colors",
            isDragging ? "bg-brand-500 ring-brand-300" : "hover:bg-brand-500",
          )}
        >
          <ShoppingBag className="size-5" />

          <AnimatePresence>
            {count > 0 && (
              <motion.span
                key={count}
                initial={{ scale: burst ? 1.8 : 1, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 22 }}
                className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-gold-400 px-1 text-[11px] font-bold text-ink-dark"
              >
                {count}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </header>
  );
}
