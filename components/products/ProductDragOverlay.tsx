"use client";

/**
 * ProductDragOverlay
 *
 * Mounted once at the app root. Handles all drag-and-drop coordination:
 *
 *   Drop on [data-drop-zone="composer"] → sets pendingMention (chat chip)
 *   Drop on [data-drop-zone="cart"]     → fires arc flight → addToCart on land
 */

import { AnimatePresence, motion, useMotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Bookmark, MessageSquarePlus, ShoppingBag } from "lucide-react";
import { getDropZoneAt } from "@/lib/chat/drop-zones";
import { useCommerce } from "@/lib/commerce/store";
import type { Product } from "@/lib/commerce/types";
import { cn } from "@/lib/utils";

interface ArcFlight {
  id: number;
  product: Product;
  startX: number;
  startY: number;
  midX: number;
  midY: number;
  endX: number;
  endY: number;
}

type DropTarget = "composer" | "cart" | "shortlist" | null;

export function ProductDragOverlay() {
  const draggedProduct = useCommerce((s) => s.draggedProduct);
  const endProductDrag = useCommerce((s) => s.endProductDrag);
  const setPendingMention = useCommerce((s) => s.setPendingMention);
  const addToCart = useCommerce((s) => s.addToCart);
  const addToShortlist = useCommerce((s) => s.addToShortlist);

  const draggedRef = useRef<Product | null>(null);
  draggedRef.current = draggedProduct;

  const x = useMotionValue(-9999);
  const y = useMotionValue(-9999);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [arcFlights, setArcFlights] = useState<ArcFlight[]>([]);

  useEffect(() => {
    if (!draggedProduct) {
      setDropTarget(null);
      return;
    }

    const onMove = (e: PointerEvent) => {
      x.set(e.clientX + 14);
      y.set(e.clientY + 10);
      setDropTarget(getDropZoneAt(e.clientX, e.clientY));
    };

    const finish = (e: PointerEvent) => {
      const product = draggedRef.current;
      const target = getDropZoneAt(e.clientX, e.clientY);

      if (product && target === "composer") {
        setPendingMention(product);
      } else if (product && target === "shortlist") {
        addToShortlist(product);
      } else if (product && target === "cart") {
        const cartEl = document.querySelector('[data-drop-zone="cart"]');
        const cartRect = cartEl?.getBoundingClientRect();
        if (cartRect) {
          const startX = e.clientX;
          const startY = e.clientY;
          const endX = cartRect.left + cartRect.width / 2;
          const endY = cartRect.top + cartRect.height / 2;
          const midX = (startX + endX) / 2;
          const midY = Math.min(startY, endY) - 110;

          setArcFlights((prev) => [
            ...prev,
            {
              id: Date.now(),
              product,
              startX,
              startY,
              midX,
              midY,
              endX,
              endY,
            },
          ]);
        } else {
          addToCart(product);
        }
      }

      endProductDrag();
      setDropTarget(null);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [draggedProduct, endProductDrag, setPendingMention, addToCart, addToShortlist, x, y]);

  const ghostBorderClass =
    dropTarget === "cart"
      ? "border-brand-400 shadow-brand-400/30"
      : dropTarget === "shortlist"
        ? "border-brand-300 shadow-brand-300/20"
        : dropTarget === "composer"
          ? "border-gold-400 shadow-gold-400/20"
          : "border-line";

  return (
    <>
      {draggedProduct && (
        <style>{`* { cursor: grabbing !important; user-select: none !important; }`}</style>
      )}

      <AnimatePresence>
        {draggedProduct && (
          <motion.div
            key="drag-ghost"
            style={{ x, y, position: "fixed", top: 0, left: 0, pointerEvents: "none", zIndex: 9999 }}
            initial={{ scale: 0.85, opacity: 0, rotate: -2 }}
            animate={{
              scale: 1,
              opacity: 1,
              rotate: dropTarget ? 0 : -2,
            }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
          >
            <div
              className={cn(
                "w-[120px] overflow-hidden rounded-xl border bg-surface shadow-2xl transition-colors duration-150",
                ghostBorderClass,
              )}
            >
              {draggedProduct.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draggedProduct.image}
                  alt={draggedProduct.name}
                  className="aspect-square w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-canvas-3">
                  <ShoppingBag className="size-6 text-ink-faint" />
                </div>
              )}
              <div className="px-2 py-1.5">
                <p className="line-clamp-2 text-[11px] font-medium leading-snug text-ink-dark">
                  {draggedProduct.name}
                </p>
              </div>
            </div>

            <AnimatePresence>
              {dropTarget && (
                <motion.div
                  key={dropTarget}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.13 }}
                  className={cn(
                    "mt-1.5 flex items-center justify-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold shadow",
                    dropTarget === "cart"
                      ? "bg-brand-700 text-white"
                      : dropTarget === "shortlist"
                        ? "bg-brand-100 text-brand-700"
                        : "bg-gold-500 text-ink-dark",
                  )}
                >
                  {dropTarget === "cart" ? (
                    <>
                      <ShoppingBag className="size-3" />
                      Add to basket
                    </>
                  ) : dropTarget === "shortlist" ? (
                    <>
                      <Bookmark className="size-3" />
                      Add to shortlist
                    </>
                  ) : (
                    <>
                      <MessageSquarePlus className="size-3" />
                      Drop to ask Ruka
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {arcFlights.map((flight) => (
        <motion.div
          key={flight.id}
          style={{ position: "fixed", top: 0, left: 0, pointerEvents: "none", zIndex: 9998 }}
          initial={{
            x: flight.startX - 20,
            y: flight.startY - 20,
            scale: 1,
            opacity: 1,
          }}
          animate={{
            x: [flight.startX - 20, flight.midX - 20, flight.endX - 20],
            y: [flight.startY - 20, flight.midY - 20, flight.endY - 20],
            scale: [1, 0.9, 0.25],
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: 0.5,
            ease: [0.4, 0, 0.2, 1],
            times: [0, 0.5, 1],
          }}
          onAnimationComplete={() => {
            addToCart(flight.product);
            setArcFlights((prev) => prev.filter((f) => f.id !== flight.id));
          }}
        >
          <div className="size-10 overflow-hidden rounded-full border-2 border-white shadow-xl ring-2 ring-brand-400/40">
            {flight.product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={flight.product.image}
                alt=""
                className="size-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-brand-100">
                <ShoppingBag className="size-4 text-brand-400" />
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </>
  );
}
