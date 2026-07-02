"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Calendar, MapPin, Pencil, Save, User, X } from "lucide-react";
import { useCommerce, type AgeGroup } from "@/lib/commerce/store";
import { RukaAvatar } from "@/components/brand/RukaAvatar";
import { cn } from "@/lib/utils";

// ── Age chip config (mirrors OnboardingGate) ──────────────────────────────────

const AGE_CHIPS: { label: string; ageGroup: AgeGroup; age: number }[] = [
  { label: "Under 20", ageGroup: "teen", age: 18 },
  { label: "20s", ageGroup: "young-adult", age: 25 },
  { label: "30s", ageGroup: "adult", age: 32 },
  { label: "40s", ageGroup: "adult", age: 42 },
  { label: "50+", ageGroup: "senior", age: 55 },
];

function chipForProfile(ageGroup?: AgeGroup, age?: number) {
  if (ageGroup) return AGE_CHIPS.find((c) => c.ageGroup === ageGroup) ?? null;
  if (age !== undefined) {
    if (age < 20) return AGE_CHIPS[0];
    if (age < 30) return AGE_CHIPS[1];
    if (age < 40) return AGE_CHIPS[2];
    if (age < 50) return AGE_CHIPS[3];
    return AGE_CHIPS[4];
  }
  return null;
}

// ── ProfileSheet ──────────────────────────────────────────────────────────────

interface ProfileSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ProfileSheet({ open, onClose }: ProfileSheetProps) {
  const userProfile = useCommerce((s) => s.userProfile);
  const setUserProfile = useCommerce((s) => s.setUserProfile);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [selectedAge, setSelectedAge] = useState<(typeof AGE_CHIPS)[0] | null>(null);
  const [city, setCity] = useState("");

  // Sync form state whenever the sheet opens.
  useEffect(() => {
    if (open) {
      setName(userProfile.name ?? "");
      setSelectedAge(chipForProfile(userProfile.ageGroup, userProfile.age));
      setCity(userProfile.city ?? "");
      setEditing(false);
    }
  }, [open, userProfile]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editing) setEditing(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, editing, onClose]);

  const canSave = name.trim().length > 0 && !!selectedAge;

  const handleSave = () => {
    if (!canSave) return;
    setUserProfile({
      name: name.trim(),
      ageGroup: selectedAge!.ageGroup,
      age: selectedAge!.age,
      ...(city.trim() ? { city: city.trim() } : { city: undefined }),
    });
    setEditing(false);
  };

  const initial = (userProfile.name ?? "?")[0].toUpperCase();

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-70 grid place-items-center p-4">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-ink/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Card */}
          <motion.div
            className="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-canvas shadow-2xl"
            initial={{ y: 24, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            {/* Top accent bar */}
            <div className="h-1 w-full bg-linear-to-r from-brand-700 via-brand-500 to-gold-400" />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="flex items-center gap-3">
                {/* Avatar initial */}
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-700 text-sm font-bold text-white shadow-sm">
                  {initial}
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold text-ink">
                    {userProfile.name ?? "Your profile"}
                  </h2>
                  <p className="text-[11px] text-ink-faint">Stored in your browser</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!editing && (
                  <button
                    onClick={() => setEditing(true)}
                    title="Edit profile"
                    className="grid size-8 place-items-center rounded-full text-ink-faint transition hover:bg-canvas-2 hover:text-ink"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="grid size-8 place-items-center rounded-full text-ink-faint transition hover:bg-canvas-2 hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-5">
              {editing ? (
                /* ── Edit mode ───────────────────────────────────────────── */
                <div className="space-y-5">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      Name
                    </label>
                    <input
                      autoFocus
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave(); }}
                      className="w-full rounded-xl border border-line bg-canvas-2 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition focus:border-brand-400 focus:outline-none"
                      placeholder="Your first name"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      Age group
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {AGE_CHIPS.map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => setSelectedAge(chip)}
                          className={cn(
                            "rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
                            selectedAge?.label === chip.label
                              ? "border-brand-500 bg-brand-700 text-white shadow-sm"
                              : "border-line bg-canvas-2 text-ink-muted hover:border-brand-300 hover:text-ink",
                          )}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      <MapPin className="size-3" />
                      City
                      <span className="normal-case tracking-normal font-normal text-ink-faint/70">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave(); }}
                      className="w-full rounded-xl border border-line bg-canvas-2 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition focus:border-brand-400 focus:outline-none"
                      placeholder="e.g. Colombo, Kandy…"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setEditing(false)}
                      className="flex-1 rounded-xl border border-line py-2.5 text-sm text-ink-muted transition hover:bg-canvas-2 hover:text-ink"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!canSave}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-700 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-brand-600 disabled:opacity-40"
                    >
                      <Save className="size-3.5" />
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                /* ── View mode ───────────────────────────────────────────── */
                <div className="space-y-3">
                  <ProfileRow icon={<User className="size-4" />} label="Name">
                    {userProfile.name ?? <span className="text-ink-faint">Not set</span>}
                  </ProfileRow>

                  <ProfileRow icon={<Calendar className="size-4" />} label="Age group">
                    {selectedAge?.label ?? <span className="text-ink-faint">Not set</span>}
                  </ProfileRow>

                  <ProfileRow icon={<MapPin className="size-4" />} label="City">
                    {userProfile.city ?? <span className="text-ink-faint">Not set</span>}
                  </ProfileRow>

                  <div className="pt-2 text-[11px] leading-relaxed text-ink-faint">
                    Ruka uses this to personalise her tone and skip the "where are you sending?" question. Stored only in your browser.
                  </div>

                  <button
                    onClick={() => setEditing(true)}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm text-ink-muted transition hover:bg-canvas-2 hover:text-ink"
                  >
                    <Pencil className="size-3.5" />
                    Edit profile
                  </button>
                </div>
              )}
            </div>

            {/* Ruka footer note */}
            <div className="flex items-center gap-2 border-t border-line bg-canvas-2/60 px-5 py-3">
              <RukaAvatar size={20} />
              <p className="text-[11px] text-ink-faint">
                Ruka adapts her tone to your age and skips asking for your city.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function ProfileRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas-2 px-3.5 py-2.5">
      <span className="text-brand-400">{icon}</span>
      <span className="w-20 shrink-0 text-xs text-ink-faint">{label}</span>
      <span className="flex-1 text-sm font-medium text-ink">{children}</span>
    </div>
  );
}
