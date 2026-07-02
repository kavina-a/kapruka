"use client";

import { SmartImage } from "@/components/ui/SmartImage";
import { Badge } from "@/components/ui/Badge";
import { useRukaChat } from "@/components/chat/ChatContext";
import { useCommerce } from "@/lib/commerce/store";
import { getProductHeaderTags } from "@/lib/catalog/product-badges";
import type { Product } from "@/lib/commerce/types";
import { cn, formatMoney } from "@/lib/utils";
import { Check, GripVertical, Minus, Plus, Search, ShoppingBag } from "lucide-react";
import { motion } from "motion/react";

interface ProductCardProps {
  product: Product;
  /** Position in the current carousel/grid (0 = first). Drives header tags. */
  rank?: number;
  /** Total products shown alongside this card — helps tag logic. */
  totalInSet?: number;
  /** A one-line "ChatRuka's note" — the gallery-label caption, when we have one. */
  note?: string;
  className?: string;
  /** When true, shows a drag handle — drag starts ONLY from the handle, not the card. */
  draggable?: boolean;
}

export function ProductCard({
  product,
  rank = 0,
  totalInSet = 1,
  note,
  className,
  draggable,
}: ProductCardProps) {
  const openDetail = useCommerce((s) => s.openDetail);
  const addToCart = useCommerce((s) => s.addToCart);
  const setQuantity = useCommerce((s) => s.setQuantity);
  const startProductDrag = useCommerce((s) => s.startProductDrag);
  const line = useCommerce((s) => s.cart.find((c) => c.product.id === product.id));
  const { sendText } = useRukaChat();

  const beginDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startProductDrag(product);
  };

  const inCart = !!line;
  const soldOut = !product.inStock;
  const headerTags = getProductHeaderTags(product, rank, totalInSet);
  const hasDiscount =
    product.compareAtPrice?.amount != null &&
    product.price.amount != null &&
    product.compareAtPrice.amount > product.price.amount;

  return (
    <motion.div
      layout
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink-dark shadow-sm",
        className,
      )}
    >
      <div className="relative block w-full bg-white">
        {/* Drag handle — ONLY this control starts a drag; rest of card is click-to-detail */}
        {draggable && !soldOut && (
          <button
            type="button"
            onPointerDown={beginDrag}
            aria-label={`Hold and drag "${product.name}" to chat or basket`}
            title="Hold to drag — drop on chat to ask Ruka, or on basket to add"
            className={cn(
              "absolute left-2 top-2 z-20 inline-flex cursor-grab items-center gap-1 rounded-full",
              "border border-line/70 bg-canvas/95 px-2 py-1 text-[10px] font-semibold text-ink-muted shadow-sm backdrop-blur-sm",
              "transition hover:border-gold-400/60 hover:text-ink active:cursor-grabbing touch-none",
              "opacity-90 group-hover:opacity-100",
            )}
          >
            <GripVertical className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">Drag</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => openDetail(product.id)}
          className="block w-full text-left"
          aria-label={`View ${product.name}`}
        >
          <SmartImage
            src={product.image}
            alt={product.name}
            wrapperClassName="aspect-square w-full bg-white"
            className="p-3 transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </button>

        {/* Social proof / status tags */}
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
          {headerTags.map((tag) => (
            <Badge key={tag.label} tone={tag.tone} className="shadow-sm backdrop-blur-sm">
              {tag.label}
            </Badge>
          ))}
        </div>

        {hasDiscount && !headerTags.some((t) => t.label === "On sale") && (
          <div className="pointer-events-none absolute right-2 top-2">
            <Badge tone="rose">Sale</Badge>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 border-t border-line p-3">
        <button
          type="button"
          onClick={() => openDetail(product.id)}
          className="line-clamp-2 text-left font-display text-[15px] leading-snug text-ink-dark hover:underline"
        >
          {product.name}
        </button>

        {note && (
          <p className="line-clamp-2 text-[12px] italic leading-snug text-ink-faint">
            &ldquo;{note}&rdquo;
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <div className="min-w-0 leading-tight">
            <div className="font-display text-base text-gold-300">
              {formatMoney(product.price.amount, product.price.currency)}
            </div>
            {hasDiscount && (
              <div className="text-xs text-ink-dark/40 line-through">
                {formatMoney(product.compareAtPrice!.amount, product.compareAtPrice!.currency)}
              </div>
            )}
          </div>

          {soldOut ? (
            <span className="text-xs font-medium text-rose-600">Unavailable</span>
          ) : inCart ? (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-brand-700 p-0.5 text-white">
              <button
                aria-label="Decrease quantity"
                onClick={() => setQuantity(product.id, line.quantity - 1)}
                className="grid size-9 place-items-center rounded-full hover:bg-brand-600"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="min-w-5 text-center text-sm font-semibold tabular-nums">
                {line.quantity}
              </span>
              <button
                aria-label="Increase quantity"
                onClick={() => setQuantity(product.id, line.quantity + 1)}
                className="grid size-9 place-items-center rounded-full hover:bg-brand-600"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => addToCart(product)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gold-500 px-3 py-1.5 text-xs font-semibold text-ink-dark transition hover:bg-gold-400 active:scale-95"
            >
              <ShoppingBag className="size-3.5" />
              Add
            </button>
          )}
        </div>

        {!soldOut && (
          <button
            type="button"
            onClick={() => sendText(`Find gifts similar to "${product.name}"`)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-canvas-2 py-1.5 text-[11px] font-medium text-brand-600 transition hover:border-brand-300 hover:bg-brand-50"
          >
            <Search className="size-3" />
            Find similar
          </button>
        )}
      </div>

      {inCart && (
        <div className="flex items-center justify-center gap-1 border-t border-brand-100 bg-brand-50 py-1 text-[11px] font-medium text-brand-700">
          <Check className="size-3" /> In your basket
        </div>
      )}
    </motion.div>
  );
}
