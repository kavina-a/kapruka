"use client";

import { useEffect, useState } from "react";
import { useCommerce } from "@/lib/commerce/store";
import { checkDeliveryAction } from "@/app/actions";
import { CityAutocomplete } from "./CityAutocomplete";
import { Button } from "@/components/ui/Button";
import { addDays, colomboToday } from "@/lib/commerce/dates";
import { ensureDeliveryCity } from "@/lib/commerce/ensure-delivery-city";
import type { DeliveryCity, LocationType } from "@/lib/commerce/types";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

const LOCATION_TYPES: LocationType[] = ["house", "apartment", "office", "other"];

const inputClass =
  "w-full rounded-xl border border-line bg-canvas-2 px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-gold-400 focus:outline-none";

function normalizePhone(p: string) {
  return p.replace(/[\s-]/g, "");
}
function isValidPhone(p: string) {
  const n = normalizePhone(p);
  return /^\+94\d{9}$/.test(n) || /^0\d{9}$/.test(n);
}

export function DeliveryForm() {
  const delivery = useCommerce((s) => s.delivery);
  const sender = useCommerce((s) => s.sender);
  const giftMessage = useCommerce((s) => s.giftMessage);
  const setDelivery = useCommerce((s) => s.setDelivery);
  const setSender = useCommerce((s) => s.setSender);
  const setGiftMessage = useCommerce((s) => s.setGiftMessage);
  const clearGiftMessage = useCommerce((s) => s.clearGiftMessage);
  const giftMessageSource = useCommerce((s) => s.giftMessageSource);
  const setQuote = useCommerce((s) => s.setQuote);
  const setCheckoutStep = useCommerce((s) => s.setCheckoutStep);
  const cart = useCommerce((s) => s.cart);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<DeliveryCity[]>([]);

  const today = colomboToday();

  useEffect(() => {
    if (!delivery.date) setDelivery({ date: addDays(today, 2) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!delivery.recipientName?.trim()) e.recipientName = "Who's receiving this?";
    if (!delivery.recipientPhone?.trim()) e.recipientPhone = "We need a contact number for delivery.";
    else if (!isValidPhone(delivery.recipientPhone)) e.recipientPhone = "Use 0771234567 or +94771234567.";
    if (!delivery.address?.trim() || delivery.address.trim().length < 3) e.address = "Add a street address.";
    if (!delivery.city?.trim()) e.city = "Pick a delivery city.";
    if (!delivery.date) e.date = "Choose a delivery date.";
    else if (delivery.date < today) e.date = "That date is in the past.";
    if (!sender.name?.trim()) e.senderName = "Add your name for the gift card.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async () => {
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

    // Prefer a perishable item (cake/flower) so we surface the right warning.
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
        setErrors((prev) => ({ ...prev, city: "We can't deliver to that city. Try a nearby town." }));
      } else if (res.code === "past_delivery_date" || res.code === "date_not_deliverable") {
        setErrors((prev) => ({ ...prev, date: "We can't deliver on that date. Pick another." }));
      } else {
        setFormError(res.error);
      }
      return;
    }

    if (!res.data.available) {
      setErrors((prev) => ({
        ...prev,
        date: "No delivery to that city on that date — try another date.",
      }));
      return;
    }

    setQuote(res.data);
    setCheckoutStep("confirm");
  };

  return (
    <div className="space-y-5 p-5">
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Who &amp; where</h3>

        <Field label="Recipient's name" error={errors.recipientName}>
          <input
            className={inputClass}
            value={delivery.recipientName ?? ""}
            onChange={(e) => setDelivery({ recipientName: e.target.value })}
            placeholder="e.g. Amma"
          />
        </Field>

        <Field label="Recipient's phone" error={errors.recipientPhone}>
          <input
            className={inputClass}
            value={delivery.recipientPhone ?? ""}
            onChange={(e) => setDelivery({ recipientPhone: e.target.value })}
            placeholder="0771234567"
            inputMode="tel"
          />
        </Field>

        <Field label="Delivery address" error={errors.address}>
          <input
            className={inputClass}
            value={delivery.address ?? ""}
            onChange={(e) => setDelivery({ address: e.target.value })}
            placeholder="House no., street, area"
          />
        </Field>

        <Field label="City / town" error={errors.city}>
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
          <Field label="Place type">
            <select
              className={inputClass}
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
          <Field label="Delivery date" error={errors.date}>
            <input
              type="date"
              min={today}
              className={cn(inputClass, "[color-scheme:light]")}
              value={delivery.date ?? ""}
              onChange={(e) => setDelivery({ date: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Delivery notes (optional)">
          <input
            className={inputClass}
            value={delivery.instructions ?? ""}
            onChange={(e) => setDelivery({ instructions: e.target.value })}
            placeholder="Gate code, landmark, best time…"
          />
        </Field>
      </section>

      <section className="space-y-3 border-t border-line pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">From you</h3>
        <Field label="Your name (on the gift card)" error={errors.senderName}>
          <input
            className={inputClass}
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
          Send anonymously (card shows &ldquo;Anonymous&rdquo;)
        </label>
        <Field label="Gift message (optional)">
          <textarea
            className={cn(inputClass, "min-h-20 resize-none")}
            value={giftMessage}
            onChange={(e) => setGiftMessage(e.target.value.slice(0, 300), "user")}
            placeholder="A few warm words to go with it…"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-ink-faint">
            <span>
              {giftMessageSource === "ai" && giftMessage
                ? "Suggested by Ruka — edit or remove below"
                : "\u00a0"}
            </span>
            <span className="flex items-center gap-2">
              {giftMessage && (
                <button
                  type="button"
                  onClick={() => clearGiftMessage()}
                  className="font-medium text-rose-400 transition hover:text-rose-300"
                >
                  Remove message
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

      <Button variant="gold" size="lg" className="w-full" loading={submitting} onClick={onSubmit}>
        Check delivery & continue
      </Button>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-300">{error}</span>}
    </label>
  );
}
