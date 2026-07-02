"use client";

import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { SmartImage } from "@/components/ui/SmartImage";
import { useCommerce } from "@/lib/commerce/store";
import { formatMoney } from "@/lib/utils";
import { Cake, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import type { CartItem } from "@/lib/commerce/types";

function LineRow({ item }: { item: CartItem }) {
  const setQuantity = useCommerce((s) => s.setQuantity);
  const removeFromCart = useCommerce((s) => s.removeFromCart);
  const setIcing = useCommerce((s) => s.setIcing);
  const openDetail = useCommerce((s) => s.openDetail);
  const { product, quantity, icingText } = item;

  return (
    <div className="flex gap-3 border-b border-line px-4 py-3">
      <button
        onClick={() => openDetail(product.id)}
        className="size-20 shrink-0 overflow-hidden rounded-xl bg-white"
      >
        <SmartImage src={product.image} alt={product.name} wrapperClassName="size-full bg-white" className="object-contain" />
      </button>
      <div className="min-w-0 flex-1">
        <button onClick={() => openDetail(product.id)} className="line-clamp-2 text-left text-sm font-medium text-ink hover:underline">
          {product.name}
        </button>
        <div className="mt-0.5 text-sm font-semibold text-gold-300">
          {formatMoney(product.price.amount, product.price.currency)}
        </div>

        {product.isCake && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <Cake className="size-3.5 shrink-0 text-gold-400" />
            <input
              value={icingText ?? ""}
              onChange={(e) => setIcing(product.id, e.target.value.slice(0, 120))}
              placeholder="Message on the cake"
              className="w-full rounded-lg border border-line bg-canvas-3 px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-gold-400 focus:outline-none"
            />
          </div>
        )}

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-full border border-line bg-canvas-3 p-0.5">
            <button aria-label="Decrease" onClick={() => setQuantity(product.id, quantity - 1)} className="grid size-7 place-items-center rounded-full hover:bg-line-strong">
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-6 text-center text-sm font-semibold tabular-nums">{quantity}</span>
            <button aria-label="Increase" onClick={() => setQuantity(product.id, quantity + 1)} className="grid size-7 place-items-center rounded-full hover:bg-line-strong">
              <Plus className="size-3.5" />
            </button>
          </div>
          <button onClick={() => removeFromCart(product.id)} aria-label="Remove" className="grid size-8 place-items-center rounded-full text-ink-faint hover:bg-rose-500/10 hover:text-rose-500">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function CartDrawer() {
  const cartOpen = useCommerce((s) => s.cartOpen);
  const closeCart = useCommerce((s) => s.closeCart);
  const cart = useCommerce((s) => s.cart);
  const subtotal = useCommerce((s) => s.cartSubtotal());
  const startCheckout = useCommerce((s) => s.startCheckout);

  return (
    <Drawer
      open={cartOpen}
      onClose={closeCart}
      title={<span>Your basket{cart.length ? ` · ${cart.length}` : ""}</span>}
      footer={
        cart.length ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Subtotal</span>
              <span className="font-display text-lg font-semibold text-ink">{formatMoney(subtotal, "LKR")}</span>
            </div>
            <p className="text-xs text-ink-faint">Delivery is calculated at the next step, once we know where it&apos;s going.</p>
            <Button variant="gold" size="lg" className="w-full" onClick={startCheckout}>
              Checkout
            </Button>
          </div>
        ) : undefined
      }
    >
      {cart.length === 0 ? (
        <div className="grid h-full place-items-center px-8 text-center">
          <div>
            <ShoppingBag className="mx-auto size-9 text-ink-faint" />
            <p className="mt-3 text-sm text-ink-muted">Your basket is empty. Tell ChatRuka who you&apos;re gifting and add a few favourites.</p>
            <Button variant="outline" className="mt-4" onClick={closeCart}>
              Keep browsing
            </Button>
          </div>
        </div>
      ) : (
        <div>
          {cart.map((item) => (
            <LineRow key={item.product.id} item={item} />
          ))}
        </div>
      )}
    </Drawer>
  );
}
