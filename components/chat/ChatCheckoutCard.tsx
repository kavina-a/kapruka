"use client";

import { useEffect, useState } from "react";
import { useCommerce } from "@/lib/commerce/store";
import {
  checkDeliveryAction,
  createOrderAction,
  revalidateCartAction,
  type StockIssue,
} from "@/app/actions";
import { CityAutocomplete } from "@/components/checkout/CityAutocomplete";
import { Button } from "@/components/ui/Button";
import { SmartImage } from "@/components/ui/SmartImage";
import { addDays, colomboToday, formatHumanDate } from "@/lib/commerce/dates";
import {
  CHECKOUT_STEP_LABELS,
  INPUT_CLASS,
  LOCATION_TYPES,
  PAYMENT_METHODS,
  type CheckoutFormStep,
  type PaymentMethodId,
  validateCheckoutFields,
} from "@/lib/commerce/checkout-utils";
import { ensureDeliveryCity } from "@/lib/commerce/ensure-delivery-city";
import type { DeliveryCity, LocationType } from "@/lib/commerce/types";
import { cn, formatMoney } from "@/lib/utils";
import { useRukaChat } from "./ChatContext";
import {
  saveChatSession,
  withPaymentReturnUrl,
} from "@/lib/chat/session-persist";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Gift,
  Loader2,
  Lock,
  Pencil,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";

const PAYMENT_ICONS: Record<PaymentMethodId, typeof CreditCard> = {
  card: CreditCard,
  bank: Building2,
  ezcash: Smartphone,
  mcash: Smartphone,
  frimi: Wallet,
};

const STEP_ORDER: CheckoutFormStep[] = ["review", "collect", "confirm", "payment"];

function StepProgress({ step }: { step: CheckoutFormStep }) {
  const idx = STEP_ORDER.indexOf(step);
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-1">
        {STEP_ORDER.map((s, i) => (
          <div key={s} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-[10px] font-bold transition",
                i < idx
                  ? "bg-brand-500 text-white"
                  : i === idx
                    ? "bg-gold-500 text-ink-dark ring-2 ring-gold-400/40"
                    : "bg-canvas-3 text-ink-faint",
              )}
            >
              {i < idx ? <CheckCircle2 className="size-3.5" /> : i + 1}
            </div>
            <span
              className={cn(
                "hidden text-center text-[10px] leading-tight sm:block",
                i === idx ? "font-medium text-ink" : "text-ink-faint",
              )}
            >
              {CHECKOUT_STEP_LABELS[s]}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-ink-muted sm:hidden">
        Step {idx + 1} of {STEP_ORDER.length} — {CHECKOUT_STEP_LABELS[step]}
      </p>
    </div>
  );
}

function Field({
  label,
  error,
  highlight,
  children,
}: {
  label: string;
  error?: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      <div
        className={cn(
          "rounded-xl transition",
          highlight && "ring-2 ring-gold-400/50 ring-offset-1 ring-offset-canvas-2",
        )}
      >
        {children}
      </div>
      {error && <span className="mt-1 block text-xs text-rose-300">{error}</span>}
    </label>
  );
}

interface ChatCheckoutCardProps {
  initialStep: CheckoutFormStep;
  highlightFields?: string[];
}

export function ChatCheckoutCard({ initialStep, highlightFields = [] }: ChatCheckoutCardProps) {
  const { messages } = useRukaChat();
  const step = useCommerce((s) => s.chatCheckoutStep) ?? initialStep;
  const setChatCheckoutStep = useCommerce((s) => s.setChatCheckoutStep);
  const cart = useCommerce((s) => s.cart);
  const subtotal = useCommerce((s) => s.cartSubtotal());
  const delivery = useCommerce((s) => s.delivery);
  const sender = useCommerce((s) => s.sender);
  const giftMessage = useCommerce((s) => s.giftMessage);
  const giftMessageSource = useCommerce((s) => s.giftMessageSource);
  const setDelivery = useCommerce((s) => s.setDelivery);
  const setSender = useCommerce((s) => s.setSender);
  const setGiftMessage = useCommerce((s) => s.setGiftMessage);
  const clearGiftMessage = useCommerce((s) => s.clearGiftMessage);
  const quote = useCommerce((s) => s.quote);
  const setQuote = useCommerce((s) => s.setQuote);
  const confirmation = useCommerce((s) => s.confirmation);
  const setConfirmation = useCommerce((s) => s.setConfirmation);
  const clientId = useCommerce((s) => s.clientId);
  const clearCart = useCommerce((s) => s.clearCart);
  const resetCheckout = useCommerce((s) => s.resetCheckout);
  const selectedPaymentMethod = useCommerce((s) => s.selectedPaymentMethod);
  const setSelectedPaymentMethod = useCommerce((s) => s.setSelectedPaymentMethod);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<DeliveryCity[]>([]);
  const [issues, setIssues] = useState<StockIssue[]>([]);
  const [checkingStock, setCheckingStock] = useState(false);
  const [highlighted, setHighlighted] = useState<string[]>(highlightFields);

  const today = colomboToday();

  useEffect(() => {
    setChatCheckoutStep(initialStep);
  }, [initialStep, setChatCheckoutStep]);

  useEffect(() => {
    if (!delivery.date) setDelivery({ date: addDays(today, 2) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (highlightFields.length) {
      setHighlighted(highlightFields);
      const t = setTimeout(() => setHighlighted([]), 3000);
      return () => clearTimeout(t);
    }
  }, [highlightFields]);

  useEffect(() => {
    if (step !== "review" || !cart.length) return;
    let cancelled = false;
    (async () => {
      setCheckingStock(true);
      const res = await revalidateCartAction(
        cart.map((c) => ({
          productId: c.product.id,
          name: c.product.name,
          quantity: c.quantity,
          unitPrice: c.product.price.amount ?? 0,
        })),
      );
      if (!cancelled && res.ok) setIssues(res.data.issues);
      if (!cancelled) setCheckingStock(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [step, cart]);

  const isHighlighted = (field: string) => highlighted.includes(field);

  const validate = () => {
    const e = validateCheckoutFields(delivery, sender, today);
    setErrors(e as Record<string, string>);
    return Object.keys(e).length === 0;
  };

  const checkDeliveryAndAdvance = async () => {
    setFormError(null);
    if (!validate()) return;
    setSubmitting(true);

    const cityRes = await ensureDeliveryCity(delivery.city ?? "");
    if (!cityRes.ok) {
      setSubmitting(false);
      setCitySuggestions(cityRes.suggestions);
      setErrors((prev) => ({ ...prev, city: cityRes.error }));
      return;
    }
    if (cityRes.city !== delivery.city?.trim()) {
      setDelivery({ city: cityRes.city });
    }
    setCitySuggestions([]);

    const perishable = cart.find((c) => c.product.isCake) ?? cart[0];
    const res = await checkDeliveryAction(
      cityRes.city,
      delivery.date!,
      perishable?.product.id,
    );
    setSubmitting(false);

    if (!res.ok) {
      if (res.code === "city_ambiguous" || res.code === "city_not_found") {
        setCitySuggestions(res.suggestions ?? []);
        setErrors((prev) => ({ ...prev, city: res.error }));
      } else if (res.code === "city_not_deliverable") {
        setErrors((prev) => ({ ...prev, city: "We can't deliver to that city." }));
      } else if (res.code === "past_delivery_date" || res.code === "date_not_deliverable") {
        setErrors((prev) => ({ ...prev, date: "We can't deliver on that date." }));
      } else {
        setFormError(res.error);
      }
      return;
    }

    if (!res.data.available) {
      setErrors((prev) => ({ ...prev, date: "No delivery on that date — try another." }));
      return;
    }

    setQuote(res.data);
    setChatCheckoutStep("confirm");
  };

  const placeOrder = async () => {
    setFormError(null);
    setSubmitting(true);

    const cityRes = await ensureDeliveryCity(delivery.city ?? "");
    if (!cityRes.ok) {
      setSubmitting(false);
      setCitySuggestions(cityRes.suggestions);
      setErrors((prev) => ({ ...prev, city: cityRes.error }));
      setChatCheckoutStep("collect");
      return;
    }
    if (cityRes.city !== delivery.city?.trim()) {
      setDelivery({ city: cityRes.city });
    }
    setCitySuggestions([]);

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
        city: cityRes.city,
        location_type: delivery.locationType ?? "house",
        date: delivery.date!,
        instructions: delivery.instructions?.trim() || null,
      },
      sender: { name: sender.name.trim(), anonymous: sender.anonymous },
      gift_message: giftMessage.trim() || null,
    });
    setSubmitting(false);

    if (!res.ok) {
      setFormError(res.error);
      if (res.code === "city_ambiguous" || res.code === "city_not_found") {
        setCitySuggestions(res.suggestions ?? []);
        setErrors((prev) => ({ ...prev, city: res.error }));
        setChatCheckoutStep("collect");
      } else if (res.code === "city_not_deliverable" || res.code === "missing_field") {
        setChatCheckoutStep("collect");
      }
      return;
    }

    setConfirmation(res.data);
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
    setChatCheckoutStep("payment");
  };

  const openPayment = () => {
    if (!confirmation?.checkoutUrl) return;
    saveChatSession(messages, confirmation.orderRef);
    const payUrl = withPaymentReturnUrl(confirmation.checkoutUrl, confirmation.orderRef);
    window.location.href = payUrl;
  };

  if (!cart.length && step !== "payment") {
    return (
      <div className="rounded-2xl border border-line bg-canvas-2 p-4 text-center text-sm text-ink-muted">
        Your basket is empty — add a gift first, then we can checkout here.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-canvas-2 shadow-sm">
      <div className="border-b border-line bg-canvas-3/50 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-brand-600">
          <Gift className="size-3.5" />
          Checkout in chat
        </div>
        <p className="mt-0.5 text-[11px] text-ink-faint">
          Fill the form below or tell me the details — we stay in sync either way.
        </p>
      </div>

      <div className="p-4">
        <StepProgress step={step} />

        {step === "review" && (
          <div className="space-y-4">
            {checkingStock ? (
              <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink-muted">
                <Loader2 className="size-4 animate-spin text-gold-400" /> Checking stock…
              </div>
            ) : issues.length > 0 ? (
              <div className="space-y-2">
                {issues.map((i) => (
                  <div
                    key={i.productId}
                    className="flex items-start gap-2 rounded-xl border border-gold-400/30 bg-gold-400/10 px-3 py-2 text-xs text-gold-200"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      <b>{i.name}</b> — {i.type === "price_changed" ? "price updated" : "unavailable"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs text-brand-400">
                <ShieldCheck className="size-3.5" /> Everything&apos;s in stock.
              </div>
            )}

            <div className="divide-y divide-line rounded-xl border border-line">
              {cart.map((item) => (
                <div key={item.product.id} className="flex gap-3 p-3">
                  <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-white">
                    <SmartImage
                      src={item.product.image}
                      alt={item.product.name}
                      wrapperClassName="size-full"
                      className="object-contain"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-1 text-sm font-medium text-ink">{item.product.name}</div>
                    <div className="text-xs text-ink-faint">Qty {item.quantity}</div>
                  </div>
                  <div className="text-sm font-semibold text-gold-300">
                    {formatMoney((item.product.price.amount ?? 0) * item.quantity, "LKR")}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Subtotal</span>
              <span className="font-semibold text-ink">{formatMoney(subtotal, "LKR")}</span>
            </div>

            <Button
              variant="gold"
              className="w-full"
              disabled={checkingStock || issues.some((i) => i.type !== "price_changed")}
              onClick={() => setChatCheckoutStep("collect")}
            >
              Continue to delivery details
            </Button>
          </div>
        )}

        {step === "collect" && (
          <div className="space-y-4">
            <p className="text-xs text-ink-muted">
              Type the details in chat or fill in here — both update the same form.
            </p>

            <section className="space-y-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">
                Who &amp; where
              </h4>

              <Field label="Recipient's name" error={errors.recipientName} highlight={isHighlighted("recipientName")}>
                <input
                  className={INPUT_CLASS}
                  value={delivery.recipientName ?? ""}
                  onChange={(e) => setDelivery({ recipientName: e.target.value })}
                  placeholder="e.g. Amma"
                />
              </Field>

              <Field label="Recipient's phone" error={errors.recipientPhone} highlight={isHighlighted("recipientPhone")}>
                <input
                  className={INPUT_CLASS}
                  value={delivery.recipientPhone ?? ""}
                  onChange={(e) => setDelivery({ recipientPhone: e.target.value })}
                  placeholder="0771234567"
                  inputMode="tel"
                />
              </Field>

              <Field label="Delivery address" error={errors.address} highlight={isHighlighted("address")}>
                <input
                  className={INPUT_CLASS}
                  value={delivery.address ?? ""}
                  onChange={(e) => setDelivery({ address: e.target.value })}
                  placeholder="House no., street, area"
                />
              </Field>

              <Field label="City / town" error={errors.city} highlight={isHighlighted("city")}>
                <CityAutocomplete
                  value={delivery.city ?? ""}
                  onChange={(city) => setDelivery({ city })}
                  onSelectValid={(city) => {
                    setDelivery({ city });
                    setErrors((p) => ({ ...p, city: "" }));
                    setCitySuggestions([]);
                  }}
                  invalid={!!errors.city}
                  error={errors.city}
                  suggestions={citySuggestions}
                  onSuggestionsChange={setCitySuggestions}
                />
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Place type" highlight={isHighlighted("locationType")}>
                  <select
                    className={INPUT_CLASS}
                    value={delivery.locationType ?? "house"}
                    onChange={(e) => setDelivery({ locationType: e.target.value as LocationType })}
                  >
                    {LOCATION_TYPES.map((t) => (
                      <option key={t} value={t} className="bg-canvas-2 capitalize">
                        {t[0].toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Delivery date" error={errors.date} highlight={isHighlighted("date")}>
                  <input
                    type="date"
                    min={today}
                    className={cn(INPUT_CLASS, "[color-scheme:light]")}
                    value={delivery.date ?? ""}
                    onChange={(e) => setDelivery({ date: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Delivery notes (optional)" highlight={isHighlighted("instructions")}>
                <input
                  className={INPUT_CLASS}
                  value={delivery.instructions ?? ""}
                  onChange={(e) => setDelivery({ instructions: e.target.value })}
                  placeholder="Gate code, landmark…"
                />
              </Field>
            </section>

            <section className="space-y-3 border-t border-line pt-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">From you</h4>

              <Field label="Your name (on the gift card)" error={errors.senderName} highlight={isHighlighted("senderName")}>
                <input
                  className={INPUT_CLASS}
                  value={sender.name ?? ""}
                  onChange={(e) => setSender({ name: e.target.value })}
                  placeholder="e.g. Kavinya"
                />
              </Field>

              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={sender.anonymous}
                  onChange={(e) => setSender({ anonymous: e.target.checked })}
                  className="size-4 accent-gold-500"
                />
                Send anonymously
              </label>

              <Field label="Gift message (optional)" highlight={isHighlighted("giftMessage")}>
                <textarea
                  className={cn(INPUT_CLASS, "min-h-16 resize-none")}
                  value={giftMessage}
                  onChange={(e) => setGiftMessage(e.target.value.slice(0, 300), "user")}
                  placeholder="A few warm words…"
                />
                <div className="mt-1 flex items-center justify-between text-[11px] text-ink-faint">
                  <span>
                    {giftMessageSource === "ai" && giftMessage ? "Suggested by Ruka" : "\u00a0"}
                  </span>
                  <span className="flex items-center gap-2">
                    {giftMessage && (
                      <button
                        type="button"
                        onClick={() => clearGiftMessage()}
                        className="font-medium text-rose-400 hover:text-rose-300"
                      >
                        Remove
                      </button>
                    )}
                    {giftMessage.length}/300
                  </span>
                </div>
              </Field>
            </section>

            {formError && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {formError}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setChatCheckoutStep("review")}>
                Back
              </Button>
              <Button variant="gold" className="flex-1" loading={submitting} onClick={checkDeliveryAndAdvance}>
                Check delivery
              </Button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gold-400/30 bg-gold-400/5 px-3 py-2.5 text-sm text-ink">
              <span className="font-medium text-gold-300">Does this look right?</span>
              <span className="text-ink-muted">
                {" "}
                Say &ldquo;yes&rdquo; or &ldquo;change the address&rdquo; in chat, or edit below.
              </span>
            </div>

            <div className="space-y-3 rounded-xl border border-line bg-canvas p-3 text-sm">
              <SummaryRow label="Delivering to">
                <div className="text-ink">{delivery.recipientName}</div>
                <div className="text-ink-muted">{delivery.recipientPhone}</div>
                <div className="text-ink-muted">
                  {delivery.address}, {delivery.city}
                </div>
                <div className="text-ink-muted">{delivery.date && formatHumanDate(delivery.date)}</div>
              </SummaryRow>

              <SummaryRow label="From">
                <div className="text-ink">{sender.anonymous ? "Anonymous" : sender.name}</div>
                {giftMessage && <div className="italic text-ink-muted">&ldquo;{giftMessage}&rdquo;</div>}
              </SummaryRow>

              {quote?.perishableWarning && (
                <div className="flex items-start gap-2 rounded-lg border border-gold-400/30 bg-gold-400/10 px-2.5 py-2 text-xs text-gold-200">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  {quote.perishableWarning}
                </div>
              )}

              <div className="border-t border-line pt-2">
                <div className="flex justify-between text-ink-muted">
                  <span>Subtotal</span>
                  <span>{formatMoney(subtotal, "LKR")}</span>
                </div>
                <div className="flex justify-between text-ink-muted">
                  <span>Delivery to {delivery.city}</span>
                  <span>{formatMoney(quote?.rate ?? 0, "LKR")}</span>
                </div>
                <div className="mt-1 flex justify-between font-semibold text-ink">
                  <span>Total</span>
                  <span className="text-gold-300">{formatMoney(subtotal + (quote?.rate ?? 0), "LKR")}</span>
                </div>
              </div>
            </div>

            {formError && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {formError}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                icon={<Pencil className="size-3.5" />}
                onClick={() => setChatCheckoutStep("collect")}
              >
                Edit details
              </Button>
              <Button
                variant="gold"
                className="flex-1"
                loading={submitting}
                icon={<Lock className="size-3.5" />}
                onClick={placeOrder}
              >
                Confirm &amp; pay
              </Button>
            </div>
          </div>
        )}

        {step === "payment" && confirmation && (
          <div className="space-y-4">
            <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-3 text-center">
              <ShieldCheck className="mx-auto size-6 text-brand-400" />
              <p className="mt-1 text-sm font-medium text-ink">Order reserved</p>
              <p className="text-xs text-ink-muted">Ref {confirmation.orderRef}</p>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-faint">
                Choose how you&apos;d like to pay
              </div>
              <p className="mb-3 text-[11px] text-ink-faint">
                You&apos;ll complete payment on Kapruka&apos;s secure page. Pick your preferred method below.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PAYMENT_METHODS.map((m) => {
                  const Icon = PAYMENT_ICONS[m.id];
                  const selected = selectedPaymentMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedPaymentMethod(m.id)}
                      className={cn(
                        "flex items-start gap-2.5 rounded-xl border p-3 text-left transition",
                        selected
                          ? "border-gold-400 bg-gold-400/10 ring-1 ring-gold-400/40"
                          : "border-line bg-canvas-2 hover:border-line-strong",
                      )}
                    >
                      <Icon className={cn("mt-0.5 size-4 shrink-0", selected ? "text-gold-400" : "text-ink-faint")} />
                      <div>
                        <div className={cn("text-sm font-medium", selected ? "text-ink" : "text-ink-muted")}>
                          {m.label}
                        </div>
                        <div className="text-[11px] text-ink-faint">{m.description}</div>
                      </div>
                      {selected && <CheckCircle2 className="ml-auto size-4 text-gold-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">Total to pay</span>
                <span className="font-display text-lg font-semibold text-gold-300">
                  {formatMoney(confirmation.summary.grandTotal, confirmation.summary.currency)}
                </span>
              </div>
            </div>

            <Button variant="gold" className="w-full" onClick={openPayment} icon={<ExternalLink className="size-4" />}>
              Pay with {PAYMENT_METHODS.find((m) => m.id === selectedPaymentMethod)?.label ?? "your method"}
            </Button>

            <p className="text-center text-[11px] text-ink-faint">
              You&apos;ll pay on Kapruka&apos;s secure page, then come back here to continue the chat.
            </p>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                if (confirmation?.orderRef) {
                  sessionStorage.setItem("chatruka-payment-welcome", confirmation.orderRef);
                }
                clearCart();
                resetCheckout();
                setChatCheckoutStep(null);
              }}
            >
              I&apos;ve completed payment — back to chat
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[11px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}
