"use client";

import { OCCASIONS } from "@/lib/catalog/occasions";
import { useRukaChat } from "@/components/chat/ChatContext";
import { cn } from "@/lib/utils";

export function OccasionChips({
  className,
  onPick,
}: {
  className?: string;
  onPick?: (label: string) => void;
}) {
  const { sendText } = useRukaChat();

  const pick = (label: string) => {
    if (onPick) onPick(label);
    sendText(`Show me ${label.toLowerCase()} gift ideas`);
  };

  return (
    <div className={cn("no-scrollbar flex gap-2 overflow-x-auto", className)}>
      {OCCASIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => pick(o.label)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-canvas-2 px-3.5 py-1.5 text-sm text-ink-muted transition hover:border-gold-400 hover:text-ink"
        >
          <span aria-hidden>{o.emoji}</span>
          {o.label}
        </button>
      ))}
    </div>
  );
}
