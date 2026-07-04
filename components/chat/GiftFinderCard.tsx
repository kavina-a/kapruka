"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import {
  GIFT_FINDER_OCCASIONS,
  GIFT_RELATIONSHIPS,
  PERSONALITY_TRAITS,
} from "@/lib/chat/gift-finder";
import { GIFT_RELATIONSHIPS_BY_ID } from "@/lib/catalog/gift-relationships";
import {
  BUDGET_TIERS,
  type BudgetTier,
  type GiftFinderState,
} from "@/lib/catalog/gift-finder-types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared chip components
// ---------------------------------------------------------------------------

function Chip({
  active,
  emoji,
  label,
  onClick,
}: {
  active: boolean;
  emoji: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-[13px] font-medium transition",
        active
          ? "border-gold-400 bg-gold-500/15 text-ink"
          : "border-line bg-canvas-2 text-ink-muted hover:border-gold-400/50 hover:text-ink",
      )}
    >
      <span className="text-base leading-none">{emoji}</span>
      <span className="min-w-0">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Determine which steps to show based on what's already known
// ---------------------------------------------------------------------------

type ActiveStep = "who" | "personality" | "budget";

function getSteps(initial: Partial<GiftFinderState>): ActiveStep[] {
  const steps: ActiveStep[] = [];
  if (!initial.relationship) steps.push("who");
  steps.push("personality");
  steps.push("budget");
  return steps;
}

// ---------------------------------------------------------------------------
// Warm intro copy — acknowledges what Ruka already knows
// ---------------------------------------------------------------------------

function buildIntroLines(
  initial: Partial<GiftFinderState>,
  steps: ActiveStep[],
): { headline: string; sub: string } {
  const rel = initial.relationship ? GIFT_RELATIONSHIPS_BY_ID[initial.relationship] : null;
  const relLabel = rel?.label ?? null;

  if (steps[0] === "who") {
    return {
      headline: "Let's find the right gift together",
      sub: "Who's this for?",
    };
  }

  if (relLabel) {
    return {
      headline: `A gift for your ${relLabel} — got it`,
      sub: "Tell me a bit about their personality and I'll pull ideas that actually fit.",
    };
  }

  return {
    headline: "Let's find the right gift",
    sub: "Tell me a bit about them and I'll pull ideas that actually fit.",
  };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const EMPTY_STATE: GiftFinderState = {
  relationship: null,
  occasionId: null,
  personalityTraits: [],
  budgetTier: null,
  exclusions: [],
};

export function GiftFinderCard({
  initial,
  onComplete,
  onDismiss,
}: {
  initial?: Partial<GiftFinderState>;
  onComplete: (state: GiftFinderState) => void;
  onDismiss?: () => void;
}) {
  const steps = useMemo(() => getSteps(initial ?? {}), [initial]);
  const [stepIdx, setStepIdx] = useState(0);
  const currentStep = steps[stepIdx];
  const isLastStep = stepIdx === steps.length - 1;

  const [state, setState] = useState<GiftFinderState>(() => ({
    ...EMPTY_STATE,
    ...initial,
    personalityTraits: initial?.personalityTraits ?? [],
    exclusions: initial?.exclusions ?? [],
  }));

  const intro = useMemo(() => buildIntroLines(initial ?? {}, steps), [initial, steps]);

  const toggleTrait = (id: string) => {
    setState((prev) => ({
      ...prev,
      personalityTraits: prev.personalityTraits.includes(id)
        ? prev.personalityTraits.filter((t) => t !== id)
        : [...prev.personalityTraits, id],
    }));
  };

  const advance = () => {
    if (isLastStep) return;
    setStepIdx((i) => i + 1);
  };

  const finish = (budgetTier?: BudgetTier | null) => {
    if (!state.personalityTraits.length && currentStep === "personality") return;
    onComplete({ ...state, budgetTier: budgetTier ?? null });
  };

  const canAdvance =
    currentStep === "who"
      ? Boolean(state.relationship)
      : currentStep === "personality"
        ? state.personalityTraits.length > 0
        : true;

  // Progress dots — only show if more than 1 step
  const showProgress = steps.length > 1;

  return (
    <div className="w-full rounded-3xl border border-line bg-canvas-2 p-5 shadow-sm">
      {/* Only show sub-headline if relationship is already known (skip the headline — Ruka said it above) */}
      {intro.sub && (
        <div className="mb-4">
          {!initial?.relationship && (
            <p className="text-[13px] font-medium text-ink-muted">{intro.sub}</p>
          )}
        </div>
      )}

      {showProgress && (
        <div className="mb-4 flex items-center gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition",
                i <= stepIdx ? "bg-gold-400" : "bg-line",
              )}
            />
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {currentStep === "who" && (
          <motion.div
            key="who"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {GIFT_RELATIONSHIPS.map((r) => (
                <Chip
                  key={r.id}
                  emoji={r.emoji}
                  label={r.label}
                  active={state.relationship === r.id}
                  onClick={() => setState((prev) => ({ ...prev, relationship: r.id }))}
                />
              ))}
            </div>

            <p className="mb-3 mt-4 text-sm text-ink-muted">Any particular occasion?</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {GIFT_FINDER_OCCASIONS.map((o) => (
                <Chip
                  key={o.id}
                  emoji={o.emoji}
                  label={o.label}
                  active={state.occasionId === o.id}
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      occasionId: prev.occasionId === o.id ? null : o.id,
                    }))
                  }
                />
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={!canAdvance}
                onClick={advance}
                className="flex items-center gap-1.5 rounded-full bg-gold-500 px-4 py-2 text-sm font-medium text-ink-dark transition enabled:hover:bg-gold-400 disabled:opacity-30"
              >
                Next <ArrowRight className="size-3.5" />
              </button>
            </div>
          </motion.div>
        )}

        {currentStep === "personality" && (
          <motion.div
            key="personality"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <p className="mb-1 text-sm font-medium text-ink">What&apos;s their vibe?</p>
            <p className="mb-4 text-xs text-ink-muted">
              Pick one or more — I&apos;ll match the picks to their personality.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PERSONALITY_TRAITS.map((t) => (
                <Chip
                  key={t.id}
                  emoji={t.emoji}
                  label={t.label}
                  active={state.personalityTraits.includes(t.id)}
                  onClick={() => toggleTrait(t.id)}
                />
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              {stepIdx > 0 ? (
                <button
                  type="button"
                  onClick={() => setStepIdx((i) => i - 1)}
                  className="text-sm text-ink-faint transition hover:text-ink-muted"
                >
                  Back
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                disabled={!canAdvance}
                onClick={advance}
                className="flex items-center gap-1.5 rounded-full bg-gold-500 px-4 py-2 text-sm font-medium text-ink-dark transition enabled:hover:bg-gold-400 disabled:opacity-30"
              >
                Next <ArrowRight className="size-3.5" />
              </button>
            </div>
          </motion.div>
        )}

        {currentStep === "budget" && (
          <motion.div
            key="budget"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <p className="mb-1 text-sm font-medium text-ink">Any budget in mind?</p>
            <p className="mb-4 text-xs text-ink-muted">
              Totally optional — skip if you&apos;re not sure.
            </p>
            <div className="flex flex-wrap gap-2">
              {BUDGET_TIERS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => finish(b.id)}
                  className="rounded-full border border-line bg-canvas-2 px-3.5 py-2 text-sm font-medium text-ink-muted transition hover:border-gold-400/50 hover:text-ink"
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStepIdx((i) => i - 1)}
                className="text-sm text-ink-faint transition hover:text-ink-muted"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => finish(null)}
                className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-gold-400/50 hover:text-ink"
              >
                No budget in mind
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {onDismiss && (
        <div className="mt-4 border-t border-line pt-3">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-ink-faint transition hover:text-ink-muted"
          >
            Actually, let me just describe what I&apos;m looking for
          </button>
        </div>
      )}
    </div>
  );
}
