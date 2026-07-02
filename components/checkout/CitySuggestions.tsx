"use client";

import type { DeliveryCity } from "@/lib/commerce/types";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface CitySuggestionsProps {
  cities: DeliveryCity[];
  onPick: (city: string) => void;
  className?: string;
}

export function CitySuggestions({ cities, onPick, className }: CitySuggestionsProps) {
  if (!cities.length) return null;

  return (
    <div className={cn("mt-2", className)}>
      <p className="mb-1.5 text-[11px] text-ink-faint">Pick the exact delivery area:</p>
      <div className="flex flex-wrap gap-1.5">
        {cities.map((c) => (
          <button
            key={c.name}
            type="button"
            onClick={() => onPick(c.name)}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas px-2.5 py-1 text-xs text-ink transition hover:border-gold-400/60 hover:bg-canvas-3"
          >
            <MapPin className="size-3 text-brand-400" />
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
