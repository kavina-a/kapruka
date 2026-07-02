"use client";

import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, MapPin } from "lucide-react";
import { useCommerce, type AgeGroup } from "@/lib/commerce/store";
import { RukaAvatar } from "@/components/brand/RukaAvatar";
import { cn } from "@/lib/utils";

// ── Age chip config ───────────────────────────────────────────────────────────

const AGE_CHIPS: { label: string; ageGroup: AgeGroup; age: number }[] = [
  { label: "Under 20", ageGroup: "teen", age: 18 },
  { label: "20s", ageGroup: "young-adult", age: 25 },
  { label: "30s", ageGroup: "adult", age: 32 },
  { label: "40s", ageGroup: "adult", age: 42 },
  { label: "50+", ageGroup: "senior", age: 55 },
];

// ── OnboardingGate ────────────────────────────────────────────────────────────

/**
 * Wraps the full app. On first visit shows a one-time intro screen that
 * collects the buyer's name, age group, and (optionally) city, then fades
 * away to reveal the chat. Never shown again once the profile is set.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const userProfile = useCommerce((s) => s.userProfile);
  const setUserProfile = useCommerce((s) => s.setUserProfile);

  // Wait for Zustand hydration before deciding whether to show the gate,
  // so we don't flash it on users who've already completed onboarding.
  const [hydrated, setHydrated] = useState(false);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const [name, setName] = useState("");
  const [selectedAge, setSelectedAge] = useState<(typeof AGE_CHIPS)[0] | null>(null);
  const [city, setCity] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);

  // Auto-focus name field when the gate appears
  useEffect(() => {
    if (hydrated && !userProfile.name) {
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [hydrated, userProfile.name]);

  const canSubmit = name.trim().length > 0 && !!selectedAge;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setUserProfile({
      name: name.trim(),
      ageGroup: selectedAge!.ageGroup,
      age: selectedAge!.age,
      ...(city.trim() ? { city: city.trim() } : {}),
    });
  };

  const onNameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && canSubmit) handleSubmit();
  };

  const showGate = hydrated && !userProfile.name && !skipped;

  return (
    <>
      {children}

      <AnimatePresence>
        {showGate && (
          <motion.div
            key="onboarding-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-200 flex items-end justify-center overflow-y-auto bg-ink/65 p-4 pb-safe backdrop-blur-md sm:items-center"
          >
            <motion.div
              key="onboarding-card"
              initial={{ opacity: 0, y: 28, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.97 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="my-auto w-full max-w-[360px] max-h-[min(90dvh,640px)] overflow-y-auto rounded-3xl border border-line bg-canvas shadow-2xl"
            >
              {/* Top accent bar */}
              <div className="h-1 w-full bg-linear-to-r from-brand-700 via-brand-500 to-gold-400" />

              <div className="px-7 pb-7 pt-6">
                {/* Ruka intro */}
                <div className="flex flex-col items-center text-center">
                  <RukaAvatar size={60} glow />
                  <h1 className="mt-4 font-display text-[22px] font-semibold leading-tight text-ink">
                    Hi, I&apos;m Ruka
                  </h1>
                  <p className="mt-1.5 max-w-[260px] text-sm leading-relaxed text-ink-muted">
                    I find the perfect gift for anyone in Sri Lanka. Tell me a little about yourself so I can talk your language.
                  </p>
                </div>

                {/* Fields */}
                <div className="mt-7 space-y-5">
                  {/* Name */}
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      What should I call you?
                    </label>
                    <input
                      ref={nameRef}
                      type="text"
                      placeholder="Your first name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={onNameKeyDown}
                      className="w-full rounded-xl border border-line bg-canvas-2 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition focus:border-brand-400 focus:outline-none"
                    />
                  </div>

                  {/* Age group */}
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      How old are you?
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {AGE_CHIPS.map((chip) => {
                        const active = selectedAge?.label === chip.label;
                        return (
                          <button
                            key={chip.label}
                            type="button"
                            onClick={() => setSelectedAge(chip)}
                            className={cn(
                              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
                              active
                                ? "border-brand-500 bg-brand-700 text-white shadow-sm"
                                : "border-line bg-canvas-2 text-ink-muted hover:border-brand-300 hover:text-ink",
                            )}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* City — optional */}
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      <MapPin className="size-3" />
                      Delivery city
                      <span className="normal-case tracking-normal font-normal text-ink-faint/70">(optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Colombo, Kandy, Galle…"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) handleSubmit(); }}
                      className="w-full rounded-xl border border-line bg-canvas-2 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition focus:border-brand-400 focus:outline-none"
                    />
                    <p className="mt-1 text-[11px] text-ink-faint">
                      Helps me skip the "where are you sending?" question.
                    </p>
                  </div>
                </div>

                {/* CTA */}
                <motion.button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  whileTap={canSubmit ? { scale: 0.97 } : {}}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 py-3 text-sm font-semibold text-white transition enabled:hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Let&apos;s find the perfect gift
                  <ArrowRight className="size-4" />
                </motion.button>

                {/* Skip */}
                <button
                  type="button"
                  onClick={() => setSkipped(true)}
                  className="mt-3 w-full text-center text-xs text-ink-faint transition hover:text-ink-muted"
                >
                  Skip for now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
