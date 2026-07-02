"use client";

import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { ArrowUp, Mic, PackageSearch } from "lucide-react";
import { RukaAvatar } from "@/components/brand/RukaAvatar";
import { OCCASIONS } from "@/lib/catalog/occasions";
import { useCommerce } from "@/lib/commerce/store";
import { RUKA } from "@/lib/agent/persona";

const QUICK = ["birthday", "romance", "mother", "newborn", "cakes", "flowers"];

export function Landing({
  onStart,
  onStartVoice,
}: {
  onStart: (prompt: string) => void;
  onStartVoice: () => void;
}) {
  const [value, setValue] = useState("");
  const openTrack = useCommerce((s) => s.openTrack);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) onStart(value.trim());
  };

  const quickChips = OCCASIONS.filter((o) => QUICK.includes(o.id));

  return (
    <div className="app-backdrop relative flex min-h-dvh flex-col overflow-hidden">
      {/* top bar */}
      <div className="flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <RukaAvatar size={36} glow />
          <span className="font-display text-lg text-ink">{RUKA.name}</span>
        </div>
        <button
          onClick={openTrack}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-ink-muted transition hover:bg-canvas-3 hover:text-ink"
        >
          <PackageSearch className="size-4" /> Track order
        </button>
      </div>

      {/* hero */}
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-5 py-8 text-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <RukaAvatar size={88} glow className="float-slow mx-auto" />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.04 }}
          className="mt-6 text-[11px] font-semibold uppercase tracking-[0.28em] text-ink-faint"
        >
          Kapruka · gift concierge
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08 }}
          className="text-balance mt-3 font-display text-4xl leading-[1.05] text-ink sm:text-6xl"
        >
          The right gift,
          <br />
          <span className="italic text-gold-300">found in a conversation.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.14 }}
          className="text-balance mt-4 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg"
        >
          I&apos;m {RUKA.name} — your gift concierge for Sri Lanka. Tell me who
          you&apos;re gifting and I&apos;ll find something they&apos;ll remember, then deliver it
          anywhere on the island.
        </motion.p>

        <motion.form
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          onSubmit={submit}
          className="mt-7 w-full max-w-xl"
        >
          <div className="flex items-center gap-2 rounded-full border border-line bg-canvas-2 p-2 pl-5 shadow-md transition focus-within:border-gold-400">
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={RUKA.greeting}
              className="flex-1 bg-transparent py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
            />
            <button
              type="submit"
              disabled={!value.trim()}
              aria-label="Start"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-gold-500 text-ink-dark transition enabled:hover:bg-gold-400 disabled:opacity-40"
            >
              <ArrowUp className="size-5" />
            </button>
          </div>
        </motion.form>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.24 }}
          className="mt-4"
        >
          <button
            onClick={onStartVoice}
            className="inline-flex items-center gap-2 rounded-full border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-200 transition hover:bg-gold-500/20"
          >
            <Mic className="size-4" /> Or call ChatRuka — English, Sinhala, or both
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.28 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-2"
        >
          {quickChips.map((o) => (
            <button
              key={o.id}
              onClick={() => onStart(`Show me ${o.label.toLowerCase()} gift ideas`)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas-2 px-3.5 py-1.5 text-sm text-ink-muted transition hover:border-gold-400 hover:text-ink"
            >
              <span>{o.emoji}</span>
              {o.label}
            </button>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
