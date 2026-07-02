import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "gold" | "forest" | "rose" | "neutral" | "warn";

const TONES: Record<Tone, string> = {
  gold: "bg-gold-500/15 text-gold-300 border-gold-500/30",
  forest: "bg-brand-500/15 text-brand-400 border-brand-500/30",
  rose: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  neutral: "bg-canvas-3 text-ink-muted border-line",
  warn: "bg-gold-400/15 text-gold-300 border-gold-400/30",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
