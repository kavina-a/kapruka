"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Check, Minus, Plus, ShoppingBag, Sparkles, Truck, X } from "lucide-react";
import { getGiftAction } from "@/app/actions";
import { useCommerce } from "@/lib/commerce/store";
import { useRukaChat } from "@/components/chat/ChatContext";
import type { GiftDetails } from "@/lib/commerce/types";
import { SmartImage } from "@/components/ui/SmartImage";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn, formatMoney } from "@/lib/utils";

export function ProductDetailOverlay() {
  const detailId = useCommerce((s) => s.detailId);
  const closeDetail = useCommerce((s) => s.closeDetail);
  const addToCart = useCommerce((s) => s.addToCart);
  const setQuantityStore = useCommerce((s) => s.setQuantity);
  const setIcingStore = useCommerce((s) => s.setIcing);
  const line = useCommerce((s) => s.cart.find((c) => c.product.id === detailId));
  const { sendText } = useRukaChat();

  const [product, setProduct] = useState<GiftDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [icing, setIcing] = useState("");

  useEffect(() => {
    if (!detailId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProduct(null);
    setActiveImage(0);
    setQty(line?.quantity ?? 1);
    setIcing(line?.icingText ?? "");
    getGiftAction(detailId).then((res) => {
      if (cancelled) return;
      if (res.ok) setProduct(res.data);
      else setError(res.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId]);

  const inCart = !!line;

  const handleAdd = () => {
    if (!product) return;
    addToCart(product, qty, product.isCake ? icing : undefined);
  };

  const askRuka = () => {
    if (!product) return;
    closeDetail();
    sendText(`Tell me more about the "${product.name}" — is it a good pick?`);
  };

  return (
    <AnimatePresence>
      {detailId && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-ink/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDetail}
          />
          <motion.div
            className="glass relative z-10 flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl pb-safe shadow-xl sm:rounded-3xl"
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            <button
              onClick={closeDetail}
              aria-label="Close"
              className="absolute right-3 top-3 z-20 grid size-9 place-items-center rounded-full bg-surface text-ink-muted ring-1 ring-line transition hover:bg-canvas-3 hover:text-ink"
            >
              <X className="size-5" />
            </button>

            {loading && (
              <div className="grid h-80 place-items-center text-ink-muted">
                <div className="size-10 shimmer rounded-full" />
              </div>
            )}

            {error && !loading && (
              <div className="grid h-72 place-items-center px-8 text-center">
                <div>
                  <p className="text-ink">{error}</p>
                  <Button variant="outline" className="mt-4" onClick={closeDetail}>
                    Back to browsing
                  </Button>
                </div>
              </div>
            )}

            {product && !loading && (
              <div className="scroll-soft grid flex-1 grid-cols-1 gap-0 overflow-y-auto md:grid-cols-2">
                {/* Gallery */}
                <div className="bg-white p-4 md:p-6">
                  <SmartImage
                    src={product.images[activeImage] ?? product.image}
                    alt={product.name}
                    wrapperClassName="aspect-square w-full rounded-2xl bg-white"
                    className="object-contain"
                  />
                  {product.images.length > 1 && (
                    <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
                      {product.images.map((img, i) => (
                        <button
                          key={img + i}
                          onClick={() => setActiveImage(i)}
                          className={cn(
                            "size-16 shrink-0 overflow-hidden rounded-xl ring-2 transition",
                            i === activeImage ? "ring-gold-500" : "ring-transparent opacity-70",
                          )}
                        >
                          <SmartImage
                            src={img}
                            alt=""
                            wrapperClassName="size-full bg-white"
                            className="object-contain"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex flex-col gap-3 p-5 md:p-6">
                  <div className="flex flex-wrap gap-1.5">
                    {product.category && <Badge tone="forest">{product.category}</Badge>}
                    {!product.inStock ? (
                      <Badge tone="rose">Sold out</Badge>
                    ) : product.stockLevel === "low" ? (
                      <Badge tone="warn">Only a few left</Badge>
                    ) : (
                      <Badge tone="forest">In stock</Badge>
                    )}
                    {product.shipping.shipsInternationally && (
                      <Badge tone="neutral">Ships worldwide</Badge>
                    )}
                  </div>

                  <h2 className="font-display text-2xl leading-tight text-ink">{product.name}</h2>

                  <div className="flex items-end gap-2">
                    <span className="font-display text-2xl font-semibold text-gold-300">
                      {formatMoney(product.price.amount, product.price.currency)}
                    </span>
                    {product.compareAtPrice?.amount != null &&
                      product.price.amount != null &&
                      product.compareAtPrice.amount > product.price.amount && (
                        <span className="pb-1 text-sm text-ink-faint line-through">
                          {formatMoney(product.compareAtPrice.amount, product.compareAtPrice.currency)}
                        </span>
                      )}
                  </div>

                  {product.description && (
                    <p className="max-h-40 overflow-y-auto scroll-soft text-sm leading-relaxed text-ink-muted">
                      {product.description}
                    </p>
                  )}

                  {product.attributes.vendor && (
                    <p className="text-xs text-ink-faint">By {product.attributes.vendor}</p>
                  )}

                  {product.isCake && (
                    <label className="block">
                      <span className="text-xs font-medium text-ink-muted">
                        Message on the cake (optional)
                      </span>
                      <input
                        value={icing}
                        onChange={(e) => setIcing(e.target.value.slice(0, 120))}
                        placeholder="e.g. Happy Birthday Amma!"
                        className="mt-1 w-full rounded-xl border border-line bg-canvas-2 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-gold-400 focus:outline-none"
                      />
                    </label>
                  )}

                  <div className="mt-auto flex flex-col gap-3 pt-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 rounded-full border border-line bg-canvas-2 p-1">
                        <button
                          aria-label="Decrease"
                          onClick={() => setQty((q) => Math.max(1, q - 1))}
                          className="grid size-8 place-items-center rounded-full hover:bg-canvas-3"
                        >
                          <Minus className="size-4" />
                        </button>
                        <span className="min-w-6 text-center font-semibold tabular-nums">{qty}</span>
                        <button
                          aria-label="Increase"
                          onClick={() => setQty((q) => Math.min(99, q + 1))}
                          className="grid size-8 place-items-center rounded-full hover:bg-canvas-3"
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>

                      {inCart ? (
                        <Button
                          variant="gold"
                          className="flex-1"
                          icon={<Check className="size-4" />}
                          onClick={() => {
                            setQuantityStore(product.id, qty);
                            if (product.isCake) setIcingStore(product.id, icing);
                          }}
                        >
                          Update basket
                        </Button>
                      ) : (
                        <Button
                          variant="gold"
                          className="flex-1"
                          disabled={!product.inStock}
                          icon={<ShoppingBag className="size-4" />}
                          onClick={handleAdd}
                        >
                          {product.inStock ? "Add to basket" : "Sold out"}
                        </Button>
                      )}
                    </div>

                    <button
                      onClick={askRuka}
                      className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-brand-600 transition hover:text-brand-700"
                    >
                      <Sparkles className="size-3.5" /> Ask ChatRuka about this
                    </button>

                    <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-faint">
                      <Truck className="size-3" /> Delivery quoted at checkout, anywhere in Sri Lanka
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
