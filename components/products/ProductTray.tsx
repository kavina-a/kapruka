"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  Gift,
  GitCompare,
  Leaf,
  LayoutGrid,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useCommerce } from "@/lib/commerce/store";
import { useRukaChat } from "@/components/chat/ChatContext";
import { OccasionChips } from "./OccasionChips";
import { ProductCard } from "./ProductCard";
import { GiftMessageCard } from "@/components/gift-message/GiftMessageCard";
import { cn } from "@/lib/utils";

const TRAY_W = 352;

// ── Shortlist strip ──────────────────────────────────────────────────────────

function ShortlistStrip() {
  const shortlist = useCommerce((s) => s.shortlist);
  const removeFromShortlist = useCommerce((s) => s.removeFromShortlist);
  const clearShortlist = useCommerce((s) => s.clearShortlist);
  const draggedProduct = useCommerce((s) => s.draggedProduct);
  const { sendText } = useRukaChat();

  const isDragActive = !!draggedProduct;
  const isFull = shortlist.length >= 3;
  const canCompare = shortlist.length >= 2;

  // Show strip when: has items OR a drag is in progress (as drop affordance)
  if (!shortlist.length && !isDragActive) return null;

  const handleCompare = () => {
    const names = shortlist.map((p) => `"${p.name}"`).join(", ");
    sendText(
      `I've shortlisted ${names}. Which would you recommend and why? Be specific.`,
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mx-3 mt-3 overflow-hidden rounded-2xl border border-line bg-canvas-2"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Bookmark className="size-3.5 text-brand-400" />
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
          Shortlist
        </span>
        {shortlist.length > 0 && (
          <button
            onClick={clearShortlist}
            className="text-[10px] text-ink-faint transition hover:text-ink"
          >
            Clear
          </button>
        )}
      </div>

      {/* Drop zone + thumbnails */}
      <div
        data-drop-zone="shortlist"
        className={cn(
          "flex min-h-[64px] items-center gap-2 px-3 py-2.5 transition-colors duration-150",
          isDragActive && !isFull
            ? "bg-brand-50/60 ring-1 ring-inset ring-brand-300/40"
            : "",
        )}
      >
        {shortlist.length === 0 ? (
          <p className="text-xs text-ink-faint">
            {isDragActive ? "Drop here to shortlist (max 3)" : "Drag products here to shortlist"}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {shortlist.map((p) => (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="group/sl relative"
                >
                  <div className="size-12 overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt={p.name} className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center bg-canvas-3">
                        <Gift className="size-4 text-ink-faint" />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeFromShortlist(p.id)}
                    aria-label={`Remove ${p.name} from shortlist`}
                    className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-canvas text-ink-faint opacity-0 shadow ring-1 ring-line transition group-hover/sl:opacity-100 hover:text-ink"
                  >
                    <X className="size-2.5" />
                  </button>
                </motion.div>
              ))}
              {/* Empty slots */}
              {Array.from({ length: 3 - shortlist.length }).map((_, i) => (
                <div
                  key={`slot-${i}`}
                  className={cn(
                    "size-12 rounded-xl border border-dashed",
                    isDragActive ? "border-brand-300/60 bg-brand-50/40" : "border-line/60",
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Compare button */}
      <AnimatePresence>
        {canCompare && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-line px-3 py-2"
          >
            <button
              onClick={handleCompare}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 py-2 text-xs font-semibold text-white transition hover:bg-brand-600"
            >
              <GitCompare className="size-3.5" />
              Compare with Ruka ({shortlist.length} items)
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main ProductTray ─────────────────────────────────────────────────────────

export function ProductTray() {
  const trayOpen = useCommerce((s) => s.trayOpen);
  const closeTray = useCommerce((s) => s.closeTray);
  const activeSet = useCommerce((s) => s.activeSet);
  const dismissedIds = useCommerce((s) => s.dismissedIds);
  const dismissProduct = useCommerce((s) => s.dismissProduct);
  const clearDismissed = useCommerce((s) => s.clearDismissed);
  const giftMessage = useCommerce((s) => s.giftMessage);
  const giftMessageSource = useCommerce((s) => s.giftMessageSource);
  const { sendText } = useRukaChat();

  // Track product-set changes while tray is open → briefly show "Updated" badge.
  const [showUpdated, setShowUpdated] = useState(false);
  const updatedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIdsRef = useRef<string>("");
  const [flashKey, setFlashKey] = useState(0);

  useEffect(() => {
    const ids = (activeSet?.products ?? []).map((p) => p.id).join(",");
    if (ids && ids !== prevIdsRef.current) {
      if (trayOpen) {
        setFlashKey((k) => k + 1);
        setShowUpdated(true);
        if (updatedTimerRef.current) clearTimeout(updatedTimerRef.current);
        updatedTimerRef.current = setTimeout(() => setShowUpdated(false), 2200);
      }
      prevIdsRef.current = ids;
      // Clear dismissals when a new search comes in
      clearDismissed();
    }
    return () => {
      if (updatedTimerRef.current) clearTimeout(updatedTimerRef.current);
    };
  }, [activeSet, trayOpen, clearDismissed]);

  const allProducts = activeSet?.products ?? [];
  const visibleProducts = allProducts.filter((p) => !dismissedIds.includes(p.id));
  const dismissCount = allProducts.filter((p) => dismissedIds.includes(p.id)).length;
  const showFeedbackBanner = dismissCount >= 3;

  // ── Shared panel content ────────────────────────────────────────────────────
  const panelContent = (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
        <LayoutGrid className="size-4 shrink-0 text-brand-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-[15px] leading-snug text-ink">
              {activeSet?.title ?? "Browse gifts"}
            </h2>
            <AnimatePresence>
              {showUpdated && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="shrink-0 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-400"
                >
                  Updated
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          {allProducts.length > 0 && (
            <p className="text-[11px] text-ink-faint">
              {visibleProducts.length} of {allProducts.length} gifts
              {dismissCount > 0 && ` · ${dismissCount} skipped`}
            </p>
          )}
        </div>
        <button
          onClick={closeTray}
          aria-label="Close tray"
          className="grid size-8 shrink-0 place-items-center rounded-full text-ink-faint transition hover:bg-canvas-3 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </header>

      {/* ── Occasion chips ── */}
      <div className="shrink-0 border-b border-line px-3 py-2">
        <OccasionChips onPick={undefined} className="py-0.5" />
      </div>

      {/* ── Scrollable body ── */}
      <div className="scroll-soft min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence>
          {giftMessage.trim() && (
            <GiftMessageCard
              message={giftMessage}
              source={giftMessageSource ?? undefined}
              variant="tray"
              onTweak={() =>
                sendText(
                  `Can you tweak the gift message? Right now it says: "${giftMessage.trim()}". I'd like something a bit different.`,
                )
              }
            />
          )}
        </AnimatePresence>

        {/* Shortlist strip (Phase 4) */}
        <AnimatePresence>
          <ShortlistStrip />
        </AnimatePresence>

        {/* Curator note */}
        {activeSet?.note && (
          <div className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-line bg-canvas-2/60 px-3 py-2">
            <Sparkles className="size-3 shrink-0 text-gold-400" />
            <span className="font-display text-xs italic leading-snug text-ink-muted">
              {activeSet.note}
            </span>
          </div>
        )}

        {/* 2-col product grid with dismiss buttons (Phase 5) */}
        <div className="p-3 pt-3">
          {visibleProducts.length > 0 ? (
            <motion.div key={flashKey} className="grid grid-cols-2 gap-2.5">
              {visibleProducts.map((p, i) => (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.04, duration: 0.2 }}
                  className="group/wrap relative"
                >
                  {/* Dismiss button */}
                  <button
                    onClick={() => dismissProduct(p.id)}
                    aria-label={`Skip ${p.name}`}
                    title="Skip this"
                    className="absolute right-1 top-1 z-30 grid size-8 place-items-center rounded-full bg-canvas/90 text-ink-faint opacity-100 shadow-sm backdrop-blur-sm transition-opacity lg:opacity-0 lg:group-hover/wrap:opacity-100 hover:text-ink"
                  >
                    <X className="size-3" />
                  </button>
                  <ProductCard
                    product={p}
                    rank={i}
                    totalInSet={visibleProducts.length}
                    draggable
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : allProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Leaf className="size-8 text-brand-400 opacity-60" />
              <p className="mt-3 max-w-[180px] text-sm leading-snug text-ink-muted">
                Gifts appear here as you chat with Ruka.
              </p>
              <p className="mt-1 text-xs text-ink-faint">Tap an occasion above to start.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-ink-muted">All gifts skipped.</p>
              <button
                onClick={clearDismissed}
                className="mt-2 text-xs font-medium text-brand-400 hover:text-brand-700"
              >
                Show them again
              </button>
            </div>
          )}
        </div>

        {/* Feedback banner after 3+ dismissals (Phase 5) */}
        <AnimatePresence>
          {showFeedbackBanner && visibleProducts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mx-3 mb-3 flex items-center gap-2 rounded-2xl border border-line bg-canvas-2 px-3 py-2.5"
            >
              <RotateCcw className="size-4 shrink-0 text-brand-400" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-ink">Not seeing the right fit?</p>
                <p className="text-[11px] text-ink-faint">
                  You&apos;ve skipped {dismissCount} — Ruka can try a different angle.
                </p>
              </div>
              <button
                onClick={() =>
                  sendText(
                    "The suggestions so far aren't quite landing — can you try a completely different angle?",
                  )
                }
                className="shrink-0 rounded-full bg-brand-700 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-brand-600"
              >
                Try again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop: in-flow sliding panel ─────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {trayOpen && (
          <motion.aside
            key="tray-desktop"
            initial={{ width: 0 }}
            animate={{ width: TRAY_W }}
            exit={{ width: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 260 }}
            className="hidden shrink-0 overflow-hidden border-l border-line bg-canvas lg:block"
            aria-label="Gift tray"
          >
            <div style={{ width: TRAY_W }} className="flex h-full flex-col">
              {panelContent}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Mobile: bottom-sheet overlay ────────────────────────────────────── */}
      <AnimatePresence>
        {trayOpen && (
          <div className="lg:hidden">
            <motion.div
              key="tray-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-ink/40"
              onClick={closeTray}
            />
            <motion.aside
              key="tray-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 280 }}
              className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-3xl border-t border-line bg-canvas shadow-2xl pb-safe"
              style={{ height: "min(72dvh, 85dvh)" }}
              aria-label="Gift tray"
            >
              <div className="flex shrink-0 justify-center pb-1 pt-3">
                <div className="h-1 w-10 rounded-full bg-line-strong" />
              </div>
              {panelContent}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
