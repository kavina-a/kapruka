"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, Sparkles } from "lucide-react";
import { ProductCard } from "./ProductCard";
import { useRukaChat } from "@/components/chat/ChatContext";
import { useCommerce } from "@/lib/commerce/store";
import type { Product } from "@/lib/commerce/types";

const SAY_MORE_CHIPS = [
  { label: "Cheaper options", query: "Show me cheaper options in the same category" },
  { label: "More premium", query: "Show me more premium gift options" },
  { label: "Something different", query: "Show me something completely different" },
  { label: "For a guy", query: "Same kind of gift, but better suited for a man" },
  { label: "Under LKR 2,000", query: "Show me gifts under LKR 2,000" },
];

interface ProductCarouselProps {
  products: Product[];
  note?: string;
  source?: "live" | "seed";
}

export function ProductCarousel({ products, note, source }: ProductCarouselProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const openTray = useCommerce((s) => s.openTray);
  const trayOpen = useCommerce((s) => s.trayOpen);
  const setActiveSet = useCommerce((s) => s.setActiveSet);
  const { sendText } = useRukaChat();

  if (!products.length) return null;

  const items = products.slice(0, 8);

  const scrollBy = (dir: 1 | -1) => {
    const card = scroller.current?.querySelector("[data-carousel-card]") as HTMLElement | null;
    const step = card?.offsetWidth ? card.offsetWidth + 12 : 172;
    scroller.current?.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const handleExpand = () => {
    // Sync this carousel's products into the shared activeSet so the tray shows them.
    setActiveSet({
      title: "ChatRuka's picks",
      subtitle: "From this conversation",
      products,
      source,
      note,
    });
    openTray();
  };

  return (
    <div className="my-1">
      {/* Top row: note (left) + expand button (right) */}
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        {note ? (
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Sparkles className="size-3.5 shrink-0 text-gold-400" />
            <span className="min-w-0 font-display italic leading-snug text-ink-muted">{note}</span>
          </div>
        ) : (
          <span />
        )}

        <button
          onClick={handleExpand}
          aria-label={`Expand to full grid — ${items.length} gifts`}
          title="Browse all in the gift tray"
          className={
            trayOpen
              ? "inline-flex items-center gap-1.5 rounded-full border border-brand-400/40 bg-brand-500/10 px-2.5 py-1 text-[11px] font-medium text-brand-400 transition hover:bg-brand-500/20"
              : "inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas-2 px-2.5 py-1 text-[11px] font-medium text-ink-muted transition hover:border-gold-400 hover:text-ink"
          }
        >
          <LayoutGrid className="size-3" />
          {items.length} gifts
        </button>
      </div>

      <div className="group relative">
        <div
          ref={scroller}
          className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1"
        >
          {items.map((p, i) => (
            <div key={p.id} data-carousel-card className="w-40 shrink-0 snap-start sm:w-44">
              <ProductCard
                product={p}
                rank={i}
                totalInSet={items.length}
                draggable
              />
            </div>
          ))}
        </div>

        {items.length > 2 && (
          <>
            <button
              onClick={() => scrollBy(-1)}
              aria-label="Scroll left"
              className="absolute -left-1 top-[38%] z-10 grid size-9 place-items-center rounded-full bg-surface text-ink shadow-md ring-1 ring-line transition hover:bg-canvas-3 sm:-left-3 lg:hidden"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={() => scrollBy(1)}
              aria-label="Scroll right"
              className="absolute -right-1 top-[38%] z-10 grid size-9 place-items-center rounded-full bg-surface text-ink shadow-md ring-1 ring-line transition hover:bg-canvas-3 sm:-right-3 lg:hidden"
            >
              <ChevronRight className="size-5" />
            </button>
            <button
              onClick={() => scrollBy(-1)}
              aria-label="Scroll left"
              className="absolute -left-3 top-[38%] hidden size-9 place-items-center rounded-full bg-surface text-ink shadow-md ring-1 ring-line transition hover:bg-canvas-3 lg:group-hover:grid"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={() => scrollBy(1)}
              aria-label="Scroll right"
              className="absolute -right-3 top-[38%] hidden size-9 place-items-center rounded-full bg-surface text-ink shadow-md ring-1 ring-line transition hover:bg-canvas-3 lg:group-hover:grid"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {/* Say More — quick refinement chips */}
      <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
        {SAY_MORE_CHIPS.map((chip) => (
          <button
            key={chip.label}
            onClick={() => sendText(chip.query)}
            className="shrink-0 rounded-full border border-line bg-canvas-2 px-2.5 py-1 text-[11px] font-medium text-ink-muted transition hover:border-brand-400/40 hover:bg-brand-500/10 hover:text-brand-400"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
