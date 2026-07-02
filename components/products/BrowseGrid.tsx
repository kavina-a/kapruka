"use client";

import { useCommerce } from "@/lib/commerce/store";
import { ProductCard } from "./ProductCard";
import { OccasionChips } from "./OccasionChips";
import { motion } from "motion/react";
import { Leaf, Sparkles } from "lucide-react";

export function BrowseGrid() {
  const activeSet = useCommerce((s) => s.activeSet);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-lg leading-tight text-ink">
              {activeSet?.title ?? "Browse gifts"}
            </h2>
            {activeSet?.subtitle && (
              <p className="text-xs text-ink-muted">{activeSet.subtitle}</p>
            )}
          </div>
          {activeSet?.products?.length ? (
            <span className="shrink-0 text-xs text-ink-faint">
              {activeSet.products.length} items
            </span>
          ) : null}
        </div>
        <OccasionChips className="mt-3" />
      </div>

      <div className="scroll-soft flex-1 overflow-y-auto p-4">
        {activeSet?.note && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-line bg-canvas-2 px-3 py-2 text-sm">
            <Sparkles className="size-3.5 shrink-0 text-gold-400" />
            <span className="font-display italic leading-snug text-ink-muted">{activeSet.note}</span>
          </div>
        )}

        {activeSet?.products?.length ? (
          <motion.div
            layout
            className="grid grid-cols-2 gap-3 lg:grid-cols-2 xl:grid-cols-3"
          >
            {activeSet.products.map((p, i) => (
              <ProductCard
                key={p.id}
                product={p}
                rank={i}
                totalInSet={activeSet.products.length}
                draggable
              />
            ))}
          </motion.div>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center">
            <div className="max-w-xs">
              <Leaf className="mx-auto size-8 text-brand-400" />
              <p className="mt-3 text-sm text-ink-muted">
                Tell ChatRuka who you&apos;re gifting, or tap an occasion above — the right
                gifts will gather here as you chat.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
