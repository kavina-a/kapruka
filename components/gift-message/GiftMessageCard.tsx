"use client";

import { useCommerce } from "@/lib/commerce/store";
import type { GiftMessageSource } from "@/lib/commerce/types";
import { cn } from "@/lib/utils";
import { MessageSquareHeart, Sparkles, X } from "lucide-react";

interface GiftMessageCardProps {
  message: string;
  source?: GiftMessageSource;
  /** chat = inline in thread; bar = pinned above composer; tray = product tray */
  variant?: "chat" | "bar" | "tray";
  className?: string;
  onRemove?: () => void;
  onTweak?: () => void;
}

export function GiftMessageCard({
  message,
  source,
  variant = "chat",
  className,
  onRemove,
  onTweak,
}: GiftMessageCardProps) {
  const clearGiftMessage = useCommerce((s) => s.clearGiftMessage);

  if (!message.trim()) return null;

  const isAi = source === "ai";
  const handleRemove = onRemove ?? (() => clearGiftMessage());

  if (variant === "bar") {
    return (
      <div
        className={cn(
          "flex items-start gap-3 rounded-2xl border border-gold-400/30 bg-gold-400/5 px-3.5 py-2.5",
          className,
        )}
      >
        <MessageSquareHeart className="mt-0.5 size-4 shrink-0 text-gold-400" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-ink">Gift card message</span>
            {isAi && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-medium text-brand-500">
                <Sparkles className="size-2.5" />
                Ruka wrote this
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm italic text-ink-muted">&ldquo;{message}&rdquo;</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isAi && onTweak && (
            <button
              type="button"
              onClick={onTweak}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-ink-muted transition hover:bg-canvas-3 hover:text-ink"
            >
              Tweak
            </button>
          )}
          <button
            type="button"
            onClick={handleRemove}
            aria-label="Remove gift message"
            className="rounded-lg p-1.5 text-ink-faint transition hover:bg-rose-500/10 hover:text-rose-400"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border",
        isAi ? "border-gold-400/35 bg-gold-400/5" : "border-line bg-canvas-2",
        variant === "tray" && "mx-3 mt-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line/60 px-3.5 py-2">
        <div className="flex items-center gap-1.5">
          <MessageSquareHeart className="size-3.5 text-gold-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
            Gift card message
          </span>
          {isAi && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-medium text-brand-500">
              <Sparkles className="size-2.5" />
              Added for you
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleRemove}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-ink-faint transition hover:bg-rose-500/10 hover:text-rose-400"
        >
          <X className="size-3.5" />
          Remove
        </button>
      </div>
      <div className="px-3.5 py-3">
        <p className="text-sm leading-relaxed text-ink">&ldquo;{message}&rdquo;</p>
        <p className="mt-2 text-[11px] text-ink-faint">
          {isAi
            ? "This goes on the gift card at checkout. Remove it anytime — or ask me to rewrite it."
            : "This will print on the gift card with your order."}
        </p>
        {isAi && onTweak && variant === "chat" && (
          <button
            type="button"
            onClick={onTweak}
            className="mt-2 text-xs font-medium text-brand-500 transition hover:text-brand-600"
          >
            Ask Ruka to tweak it →
          </button>
        )}
      </div>
    </div>
  );
}

/** Pinned bar above the composer — reads live store state. */
export function ActiveGiftMessageBar({
  className,
  onTweak,
}: {
  className?: string;
  onTweak?: () => void;
}) {
  const giftMessage = useCommerce((s) => s.giftMessage);
  const giftMessageSource = useCommerce((s) => s.giftMessageSource);
  if (!giftMessage.trim()) return null;
  return (
    <GiftMessageCard
      message={giftMessage}
      source={giftMessageSource ?? undefined}
      variant="bar"
      className={className}
      onTweak={onTweak}
    />
  );
}
