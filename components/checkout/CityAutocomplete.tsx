"use client";

import { useEffect, useRef, useState } from "react";
import { findCitiesAction } from "@/app/actions";
import type { DeliveryCity } from "@/lib/commerce/types";
import { DELIVERY_CITY_HINT, ensureDeliveryCity } from "@/lib/commerce/ensure-delivery-city";
import { CitySuggestions } from "./CitySuggestions";
import { Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface CityAutocompleteProps {
  value: string;
  onChange: (city: string) => void;
  /** Called when the user picks a confirmed, deliverable city. */
  onSelectValid: (city: string) => void;
  invalid?: boolean;
  error?: string;
  suggestions?: DeliveryCity[];
  onSuggestionsChange?: (cities: DeliveryCity[]) => void;
}

export function CityAutocomplete({
  value,
  onChange,
  onSelectValid,
  invalid,
  error,
  suggestions = [],
  onSuggestionsChange,
}: CityAutocompleteProps) {
  const [results, setResults] = useState<DeliveryCity[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickedRef = useRef(false);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const query = (q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      const res = await findCitiesAction(q.trim());
      setLoading(false);
      if (res.ok) {
        setResults(res.data);
        setOpen(true);
      }
    }, 300);
  };

  const pickCity = (city: string) => {
    pickedRef.current = true;
    onChange(city);
    onSelectValid(city);
    onSuggestionsChange?.([]);
    setOpen(false);
  };

  const tryResolveOnBlur = async () => {
    const trimmed = value.trim();
    if (!trimmed || pickedRef.current) {
      pickedRef.current = false;
      return;
    }

    setResolving(true);
    const res = await ensureDeliveryCity(trimmed);
    setResolving(false);

    if (res.ok) {
      if (res.city !== trimmed) onChange(res.city);
      onSelectValid(res.city);
      onSuggestionsChange?.([]);
      return;
    }

    onSuggestionsChange?.(res.suggestions);
  };

  const showSuggestions = suggestions.length > 0 ? suggestions : [];

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input
          value={value}
          onChange={(e) => {
            pickedRef.current = false;
            onChange(e.target.value);
            onSuggestionsChange?.([]);
            query(e.target.value);
          }}
          onBlur={() => {
            void tryResolveOnBlur();
          }}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Start typing a city or town…"
          className={cn(
            "w-full rounded-xl border bg-canvas-2 py-2.5 pl-9 pr-9 text-sm text-ink placeholder:text-ink-faint focus:outline-none",
            invalid ? "border-rose-500/60" : "border-line focus:border-gold-400",
          )}
        />
        {(loading || resolving) && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-faint" />
        )}
      </div>

      {!error && !invalid && (
        <p className="mt-1 text-[11px] text-ink-faint">{DELIVERY_CITY_HINT}</p>
      )}

      {open && results.length > 0 && (
        <ul className="scroll-soft absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-canvas-2 py-1 shadow-lg">
          {results.map((c) => (
            <li key={c.name}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickCity(c.name)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-canvas-3"
              >
                <MapPin className="size-3.5 text-brand-400" />
                <span>{c.name}</span>
                {c.aliases.length > 0 && (
                  <span className="ml-auto truncate text-xs text-ink-faint">
                    {c.aliases.slice(0, 2).join(", ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showSuggestions.length > 0 && (
        <CitySuggestions cities={showSuggestions} onPick={pickCity} />
      )}
    </div>
  );
}
