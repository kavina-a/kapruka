"use client";

import { AnimatePresence, motion } from "motion/react";
import { UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCommerce } from "@/lib/commerce/store";
import { useToast } from "./Toast";

interface SaveRecipientPromptProps {
  /** Whether to show the prompt — set to true once order is confirmed. */
  visible: boolean;
  onDismiss: () => void;
}

/**
 * A non-intrusive bottom card that appears after order confirmation.
 * Pre-fills the recipient name from delivery state; user can edit to a
 * nickname (e.g. "Amma") before saving. No agent involvement.
 */
export function SaveRecipientPrompt({ visible, onDismiss }: SaveRecipientPromptProps) {
  const deliveryName = useCommerce((s) => s.delivery.recipientName ?? "");
  const deliveryPhone = useCommerce((s) => s.delivery.recipientPhone);
  const deliveryCity = useCommerce((s) => s.delivery.city);
  const saveRecipient = useCommerce((s) => s.saveRecipient);
  const { toast } = useToast();

  const [name, setName] = useState(deliveryName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-sync when delivery name changes (e.g. a new order is placed).
  useEffect(() => {
    if (visible) setName(deliveryName);
  }, [visible, deliveryName]);

  // Focus the input when the card appears.
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveRecipient({ name: trimmed, phone: deliveryPhone, city: deliveryCity });
    toast(`${trimmed} saved to your recipients`, "👤");
    onDismiss();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: "spring", damping: 30, stiffness: 340 }}
          className="mx-4 mb-4 overflow-hidden rounded-2xl border border-brand-700/20 bg-brand-50 shadow-lg"
        >
          <div className="flex items-start gap-3 p-4">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-700/10 text-brand-700">
              <UserPlus className="size-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">
                Save this recipient for next time?
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                One tap to pre-fill their details on your next gift.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") onDismiss();
                  }}
                  placeholder="Name or nickname"
                  className="flex-1 rounded-xl border border-brand-300/40 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-700/30"
                />
                <button
                  onClick={handleSave}
                  disabled={!name.trim()}
                  className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </div>
            <button
              onClick={onDismiss}
              aria-label="Not now"
              className="grid size-7 shrink-0 place-items-center rounded-full text-ink-faint transition hover:bg-brand-100 hover:text-ink-muted"
            >
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
