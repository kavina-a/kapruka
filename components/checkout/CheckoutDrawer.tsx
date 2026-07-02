"use client";

import { useEffect, useRef, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { SmartImage } from "@/components/ui/SmartImage";
import { DeliveryForm } from "./DeliveryForm";
import { useCommerce } from "@/lib/commerce/store";
import { createOrderAction, revalidateCartAction, type StockIssue } from "@/app/actions";
import { formatHumanDate } from "@/lib/commerce/dates";
import { cn, formatMoney } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Gift,
  Loader2,
  Lock,
  PartyPopper,
  ShieldCheck,
} from "lucide-react";
import { SaveRecipientPrompt } from "@/components/ui/SaveRecipientPrompt";
import {
  loadChatSession,
  saveChatSession,
  withPaymentReturnUrl,
} from "@/lib/chat/session-persist";

const STEP_TITLES: Record<string, string> = {
  review: "Review your basket",
  delivery: "Delivery details",
  confirm: "Confirm & pay",
  creating: "Creating your order",
  payment: "Secure payment",
  done: "Order placed",
};

const STEP_ORDER = ["review", "delivery", "confirm"] as const;

function StepDots({ step }: { step: string }) {
  const idx = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number]);
  const activeIdx = step === "payment" || step === "done" || step === "creating" ? 3 : idx;
  return (
    <div className="flex items-center gap-1.5">
      {["Basket", "Delivery", "Confirm", "Pay"].map((label, i) => (
        <div key={label} className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-2 rounded-full transition",
              i <= activeIdx ? "bg-gold-400" : "bg-line-strong",
            )}
          />
          {i < 3 && <span className="h-px w-3 bg-line-strong" />}
        </div>
      ))}
    </div>
  );
}

export function CheckoutDrawer() {
  const checkoutOpen = useCommerce((s) => s.checkoutOpen);
  const closeCheckout = useCommerce((s) => s.closeCheckout);
  const step = useCommerce((s) => s.checkoutStep);
  const setStep = useCommerce((s) => s.setCheckoutStep);
  const cart = useCommerce((s) => s.cart);
  const subtotal = useCommerce((s) => s.cartSubtotal());
  const delivery = useCommerce((s) => s.delivery);
  const sender = useCommerce((s) => s.sender);
  const giftMessage = useCommerce((s) => s.giftMessage);
  const quote = useCommerce((s) => s.quote);
  const confirmation = useCommerce((s) => s.confirmation);
  const setConfirmation = useCommerce((s) => s.setConfirmation);
  const checkoutError = useCommerce((s) => s.checkoutError);
  const setCheckoutError = useCommerce((s) => s.setCheckoutError);
  const removeFromCart = useCommerce((s) => s.removeFromCart);
  const setProductPrice = useCommerce((s) => s.setProductPrice);
  const clearCart = useCommerce((s) => s.clearCart);
  const resetCheckout = useCommerce((s) => s.resetCheckout);
  const openTrack = useCommerce((s) => s.openTrack);
  const saveRecipient = useCommerce((s) => s.saveRecipient);
  const savedRecipients = useCommerce((s) => s.savedRecipients);
  const clientId = useCommerce((s) => s.clientId);
  const [showSavePrompt, setShowSavePrompt] = useState(false);

  const title = STEP_TITLES[step] ?? "Checkout";

  return (
    <Drawer
      open={checkoutOpen}
      onClose={closeCheckout}
      title={
        <div className="flex flex-col gap-1.5">
          <span>{title}</span>
          <StepDots step={step} />
        </div>
      }
    >
      {cart.length === 0 && step !== "done" && step !== "payment" ? (
        <div className="grid h-full place-items-center p-8 text-center text-sm text-ink-muted">
          Your basket is empty.
        </div>
      ) : step === "review" ? (
        <ReviewStep
          onContinue={() => setStep("delivery")}
          onRemove={removeFromCart}
          onUpdatePrice={setProductPrice}
        />
      ) : step === "delivery" ? (
        <div>
          <BackBar onClick={() => setStep("review")} label="Back to basket" />
          <DeliveryForm />
        </div>
      ) : step === "confirm" ? (
        <ConfirmStep
          onBack={() => setStep("delivery")}
          onConfirm={async () => {
            setCheckoutError(null);
            setStep("creating");
            const phone = (delivery.recipientPhone ?? "").replace(/[\s-]/g, "");
            const res = await createOrderAction({
              cart: cart.map((c) => ({
                product_id: c.product.id,
                quantity: c.quantity,
                icing_text: c.product.isCake ? c.icingText ?? null : null,
              })),
              recipient: { name: delivery.recipientName!.trim(), phone },
              delivery: {
                address: delivery.address!.trim(),
                city: delivery.city!.trim(),
                location_type: delivery.locationType ?? "house",
                date: delivery.date!,
                instructions: delivery.instructions?.trim() || null,
              },
              sender: { name: sender.name.trim(), anonymous: sender.anonymous },
              gift_message: giftMessage.trim() || null,
            });

            if (res.ok) {
              setConfirmation(res.data);

              // Persist order record to MongoDB (fire-and-forget, non-blocking).
              fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  clientId,
                  recipient: delivery.recipientName!.trim(),
                  recipientCity: delivery.city?.trim(),
                  items: cart.map((c) => c.product.name),
                  total: res.data.summary.grandTotal,
                  date: new Date().toISOString(),
                  orderRef: res.data.orderRef,
                }),
              }).catch(() => {});

              // Show opt-in save prompt only if recipient not already saved.
              const alreadySaved = savedRecipients.some(
                (r) => r.name.toLowerCase() === delivery.recipientName!.trim().toLowerCase(),
              );
              if (!alreadySaved) setShowSavePrompt(true);
              setStep("payment");
              return;
            }

            setCheckoutError({ message: res.error, code: res.code });
            // Route the user back to where they can fix it.
            if (res.code === "product_out_of_stock" || res.code === "empty_cart") {
              setStep("review");
            } else if (
              res.code === "city_ambiguous" ||
              res.code === "city_not_found" ||
              res.code === "city_not_deliverable" ||
              res.code === "past_delivery_date" ||
              res.code === "date_not_deliverable" ||
              res.code === "missing_field"
            ) {
              setStep("delivery");
            } else {
              setStep("confirm");
            }
          }}
          subtotal={subtotal}
        />
      ) : step === "creating" ? (
        <div className="grid h-72 place-items-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-gold-400" />
            <p className="mt-3 text-sm text-ink-muted">Locking your price and creating a secure order…</p>
          </div>
        </div>
      ) : step === "payment" && confirmation ? (
        <PaymentStep />
      ) : step === "done" ? (
        <DoneStep
          onNewGift={() => {
            clearCart();
            resetCheckout();
            closeCheckout();
          }}
          onTrack={() => {
            closeCheckout();
            openTrack();
          }}
        />
      ) : null}

      {checkoutError && (step === "confirm" || step === "review") && (
        <div className="mx-5 mb-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{checkoutError.message}</span>
        </div>
      )}

      <SaveRecipientPrompt
        visible={showSavePrompt && step === "payment"}
        onDismiss={() => setShowSavePrompt(false)}
      />
    </Drawer>
  );
}

function BackBar({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-5 pt-4 text-sm text-ink-muted hover:text-ink"
    >
      <ArrowLeft className="size-4" /> {label}
    </button>
  );
}

function ReviewStep({
  onContinue,
  onRemove,
  onUpdatePrice,
}: {
  onContinue: () => void;
  onRemove: (id: string) => void;
  onUpdatePrice: (id: string, amount: number) => void;
}) {
  const cart = useCommerce((s) => s.cart);
  const subtotal = useCommerce((s) => s.cartSubtotal());
  const [issues, setIssues] = useState<StockIssue[]>([]);
  const [checking, setChecking] = useState(true);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      setChecking(true);
      const res = await revalidateCartAction(
        cart.map((c) => ({
          productId: c.product.id,
          name: c.product.name,
          quantity: c.quantity,
          unitPrice: c.product.price.amount ?? 0,
        })),
      );
      if (res.ok) setIssues(res.data.issues);
      setChecking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blocking = issues.filter((i) => i.type === "out_of_stock" || i.type === "unavailable");

  return (
    <div className="flex flex-col">
      <div className="px-5 pt-4 pb-2">
        {checking ? (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas-2 px-3 py-2 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin text-gold-400" /> Checking stock and prices…
          </div>
        ) : issues.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm text-brand-400">
            <ShieldCheck className="size-4" /> Everything&apos;s in stock at the listed price.
          </div>
        ) : (
          <div className="space-y-2">
            {issues.map((i) => (
              <div
                key={i.productId}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-gold-400/30 bg-gold-400/10 px-3 py-2 text-sm text-gold-200"
              >
                <AlertTriangle className="size-4 shrink-0" />
                {i.type === "price_changed" ? (
                  <>
                    <span>
                      <b>{i.name}</b> is now {formatMoney(i.newPrice, "LKR")} (was{" "}
                      {formatMoney(i.oldPrice, "LKR")}).
                    </span>
                    <button
                      onClick={() => {
                        onUpdatePrice(i.productId, i.newPrice ?? 0);
                        setIssues((prev) => prev.filter((x) => x.productId !== i.productId));
                      }}
                      className="ml-auto rounded-full bg-gold-500 px-2.5 py-1 text-xs font-semibold text-ink-dark"
                    >
                      Update price
                    </button>
                  </>
                ) : (
                  <>
                    <span>
                      <b>{i.name}</b> is currently unavailable.
                    </span>
                    <button
                      onClick={() => {
                        onRemove(i.productId);
                        setIssues((prev) => prev.filter((x) => x.productId !== i.productId));
                      }}
                      className="ml-auto rounded-full bg-rose-500 px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="divide-y divide-line">
        {cart.map((item) => (
          <div key={item.product.id} className="flex gap-3 px-5 py-3">
            <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-white">
              <SmartImage src={item.product.image} alt={item.product.name} wrapperClassName="size-full bg-white" className="object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-1 text-sm font-medium text-ink">{item.product.name}</div>
              <div className="text-xs text-ink-faint">Qty {item.quantity}</div>
              {item.product.isCake && item.icingText && (
                <div className="mt-0.5 truncate text-xs text-ink-muted">Icing: “{item.icingText}”</div>
              )}
            </div>
            <div className="text-sm font-semibold text-gold-300">
              {formatMoney((item.product.price.amount ?? 0) * item.quantity, "LKR")}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">Subtotal</span>
          <span className="font-display text-lg font-semibold text-ink">{formatMoney(subtotal, "LKR")}</span>
        </div>
        <Button
          variant="gold"
          size="lg"
          className="w-full"
          disabled={checking || blocking.length > 0 || cart.length === 0}
          onClick={onContinue}
        >
          Continue to delivery
        </Button>
        {blocking.length > 0 && (
          <p className="text-center text-xs text-rose-300">
            Remove the unavailable item{blocking.length > 1 ? "s" : ""} to continue.
          </p>
        )}
      </div>
    </div>
  );
}

function ConfirmStep({
  onBack,
  onConfirm,
  subtotal,
}: {
  onBack: () => void;
  onConfirm: () => void;
  subtotal: number;
}) {
  const cart = useCommerce((s) => s.cart);
  const delivery = useCommerce((s) => s.delivery);
  const sender = useCommerce((s) => s.sender);
  const giftMessage = useCommerce((s) => s.giftMessage);
  const quote = useCommerce((s) => s.quote);
  const fee = quote?.rate ?? 0;
  const grand = subtotal + fee;

  return (
    <div>
      <BackBar onClick={onBack} label="Edit delivery" />
      <div className="space-y-4 p-5">
        <Row label="Delivering to">
          <div className="text-ink">{delivery.recipientName}</div>
          <div className="text-ink-muted">{delivery.recipientPhone}</div>
          <div className="text-ink-muted">
            {delivery.address}, {delivery.city}
          </div>
          <div className="text-ink-muted">{formatHumanDate(delivery.date)}</div>
        </Row>

        <Row label="From">
          <div className="text-ink">{sender.anonymous ? "Anonymous" : sender.name}</div>
          {giftMessage && <div className="mt-1 italic text-ink-muted">“{giftMessage}”</div>}
        </Row>

        {quote?.perishableWarning && (
          <div className="flex items-start gap-2 rounded-xl border border-gold-400/30 bg-gold-400/10 px-3 py-2 text-xs text-gold-200">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {quote.perishableWarning}
          </div>
        )}

        <div className="rounded-2xl border border-line bg-canvas-2 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
            <Gift className="size-3.5" /> {cart.length} item{cart.length > 1 ? "s" : ""}
          </div>
          <Line label="Subtotal" value={formatMoney(subtotal, "LKR")} />
          <Line label={`Delivery to ${delivery.city ?? ""}`} value={formatMoney(fee, "LKR")} />
          <div className="my-2 h-px bg-line" />
          <Line label="Total" value={formatMoney(grand, "LKR")} strong />
          <p className="mt-2 text-[11px] text-ink-faint">
            Your price is locked for 60 minutes on the secure pay link.
          </p>
        </div>

        <Button variant="gold" size="lg" className="w-full" onClick={onConfirm} icon={<Lock className="size-4" />}>
          Confirm &amp; get secure pay link
        </Button>
        <p className="text-center text-[11px] text-ink-faint">
          Payment is completed on Kapruka&apos;s secure checkout. We never see your card details.
        </p>
      </div>
    </div>
  );
}

function PaymentStep() {
  const confirmation = useCommerce((s) => s.confirmation)!;
  const setStep = useCommerce((s) => s.setCheckoutStep);
  const [opened, setOpened] = useState(false);
  const [minsLeft, setMinsLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const ms = new Date(confirmation.expiresAt).getTime() - Date.now();
      setMinsLeft(Math.max(0, Math.floor(ms / 60000)));
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [confirmation.expiresAt]);

  const pay = () => {
    const existing = loadChatSession();
    saveChatSession(existing?.messages ?? [], confirmation.orderRef);
    window.location.href = withPaymentReturnUrl(confirmation.checkoutUrl, confirmation.orderRef);
  };

  return (
    <div className="space-y-4 p-5">
      <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-4 text-center">
        <ShieldCheck className="mx-auto size-8 text-brand-400" />
        <p className="mt-2 text-sm text-ink">Your order is reserved.</p>
        <p className="text-xs text-ink-muted">Reference {confirmation.orderRef}</p>
      </div>

      <div className="rounded-2xl border border-line bg-canvas-2 p-4">
        <Line label="Items" value={formatMoney(confirmation.summary.itemsTotal, confirmation.summary.currency)} />
        <Line label="Delivery" value={formatMoney(confirmation.summary.deliveryFee, confirmation.summary.currency)} />
        {confirmation.summary.addonsTotal > 0 && (
          <Line label="Add-ons" value={formatMoney(confirmation.summary.addonsTotal, confirmation.summary.currency)} />
        )}
        <div className="my-2 h-px bg-line" />
        <Line label="Total to pay" value={formatMoney(confirmation.summary.grandTotal, confirmation.summary.currency)} strong />
        {minsLeft !== null && (
          <p className="mt-2 text-[11px] text-ink-faint">
            {minsLeft > 0 ? `Pay link valid for about ${minsLeft} more minutes.` : "This pay link may have expired — create the order again if needed."}
          </p>
        )}
      </div>

      <Button variant="gold" size="lg" className="w-full" onClick={pay} icon={<ExternalLink className="size-4" />}>
        Pay securely on Kapruka
      </Button>

      <p className="text-center text-xs text-ink-muted">
        You&apos;ll finish payment on Kapruka&apos;s checkout page. After paying, Kapruka emails you an
        order number you can track here anytime.
      </p>

      {opened && (
        <Button variant="outline" className="w-full" onClick={() => setStep("done")}>
          I&apos;ve completed payment
        </Button>
      )}
    </div>
  );
}

function DoneStep({ onNewGift, onTrack }: { onNewGift: () => void; onTrack: () => void }) {
  const confirmation = useCommerce((s) => s.confirmation);
  return (
    <div className="space-y-5 p-6 text-center">
      <PartyPopper className="mx-auto size-12 text-gold-400" />
      <div>
        <h3 className="font-display text-xl text-ink">That&apos;s a gift well sent.</h3>
        <p className="mt-1 text-sm text-ink-muted">
          {confirmation
            ? `Order ${confirmation.orderRef} is on its way. Once payment clears, Kapruka emails you a tracking number.`
            : "Your order is on its way."}
        </p>
      </div>
      <div className="flex items-center justify-center gap-2 text-sm text-brand-400">
        <CheckCircle2 className="size-4" /> Discovery → cart → delivery → payment, all done.
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="gold" onClick={onNewGift}>
          Send another gift
        </Button>
        <Button variant="ghost" onClick={onTrack}>
          Track an order
        </Button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span className={cn(strong ? "font-medium text-ink" : "text-ink-muted")}>{label}</span>
      <span className={cn(strong ? "font-display text-lg font-semibold text-gold-300" : "text-ink")}>{value}</span>
    </div>
  );
}
