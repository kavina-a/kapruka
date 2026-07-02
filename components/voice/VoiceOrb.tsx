"use client";

import { useId } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { VoiceOrbState } from "@/lib/voice/orb-state";

export interface VoiceOrbProps {
  state: VoiceOrbState;
  size?: number;
  className?: string;
  /** Accessible label for the voice avatar. */
  label?: string;
}

const THINKING_PARTICLES = Array.from({ length: 8 }, (_, i) => ({
  angle: i * 45,
  r: 0.88 + (i % 3) * 0.06,
}));

/**
 * ChatRuka voice avatar — the Kapruka yellow smile as the core form, with a
 * tiny expressive face inside and soft purple ambient light. Not a generic AI orb.
 */
export function VoiceOrb({ state, size = 48, className, label = "ChatRuka voice" }: VoiceOrbProps) {
  const uid = useId().replace(/:/g, "");
  const glowId = `voice-orb-glow-${uid}`;
  const smileGradId = `voice-orb-smile-${uid}`;
  const hoodGradId = `voice-orb-hood-${uid}`;
  const purpleGlowId = `voice-orb-purple-${uid}`;

  /** Kapruka smile arc — the signature yellow curve is the voice waveform body. */
  const smilePath = "M 18 52 C 18 52, 34 88, 60 90 C 86 88, 102 52, 102 52";
  const smileHighlight = "M 26 54 C 38 76, 50 82, 60 83 C 70 82, 82 76, 94 54";

  return (
    <div
      className={cn("relative grid place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      data-voice-orb-state={state}
    >
      {/* Soft purple ambient halo */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 52%, color-mix(in oklab, #8a72bc 32%, transparent) 0%, transparent 70%)",
        }}
        animate={
          state === "thinking"
            ? { opacity: [0.5, 0.82, 0.5], scale: [0.94, 1.06, 0.94] }
            : state === "listening"
              ? { opacity: [0.38, 0.62, 0.38], scale: [0.96, 1.04, 0.96] }
              : state === "speaking"
                ? { opacity: [0.42, 0.58, 0.42], scale: [0.98, 1.02, 0.98] }
                : { opacity: [0.28, 0.4, 0.28], scale: [0.98, 1.03, 0.98] }
        }
        transition={{
          duration:
            state === "listening" ? 0.95 : state === "thinking" ? 2.6 : state === "speaking" ? 0.65 : 3.8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <motion.svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className="relative overflow-visible"
        animate={
          state === "idle"
            ? { scale: [1, 1.035, 1], y: [0, -1.5, 0] }
            : state === "listening"
              ? { scale: [1, 1.07, 1, 1.04, 1] }
              : { scale: 1, y: 0 }
        }
        transition={{
          duration: state === "listening" ? 1.05 : 4.4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <defs>
          <radialGradient id={glowId} cx="50%" cy="44%" r="54%">
            <stop offset="0%" stopColor="#ebe4f8" stopOpacity="0.95" />
            <stop offset="48%" stopColor="#6b44a3" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#41236d" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={smileGradId} x1="16" y1="68" x2="104" y2="68" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffe566" />
            <stop offset="42%" stopColor="#ffd200" />
            <stop offset="100%" stopColor="#f0c400" />
          </linearGradient>
          <radialGradient id={hoodGradId} cx="50%" cy="38%" r="50%">
            <stop offset="0%" stopColor="#5a358f" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#41236d" stopOpacity="0" />
          </radialGradient>
          <filter id={purpleGlowId} x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="2.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Subtle purple hood — almost no body, just warmth behind the face */}
        <ellipse cx="60" cy="46" rx="34" ry="28" fill={`url(#${hoodGradId})`} opacity="0.9" />

        {/* Purple inner wash */}
        <ellipse cx="60" cy="54" rx="40" ry="34" fill={`url(#${glowId})`} opacity="0.82" />

        {/* Thinking — slow purple orbit around the smile */}
        {state === "thinking" && (
          <motion.g
            style={{ transformOrigin: "60px 58px" }}
            animate={{ rotate: 360 }}
            transition={{ duration: 5.2, repeat: Infinity, ease: "linear" }}
          >
            {THINKING_PARTICLES.map((p, i) => {
              const rad = (p.angle * Math.PI) / 180;
              const cx = 60 + Math.cos(rad) * 46 * p.r;
              const cy = 58 + Math.sin(rad) * 38 * p.r;
              return (
                <motion.circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={2.2 + (i % 2) * 0.6}
                  fill="#9b84c9"
                  animate={{ opacity: [0.35, 0.75, 0.35] }}
                  transition={{ duration: 1.8 + i * 0.15, repeat: Infinity, ease: "easeInOut" }}
                />
              );
            })}
          </motion.g>
        )}

        {/* Kapruka smile — stretches and compresses as the voice waveform */}
        <motion.g
          style={{ transformOrigin: "60px 76px" }}
          animate={
            state === "speaking"
              ? { scaleX: [1, 1.16, 0.9, 1.12, 0.96, 1], scaleY: [1, 0.86, 1.1, 0.9, 1.04, 1] }
              : state === "listening"
                ? { scaleX: [1, 1.06, 1, 1.03, 1], scaleY: [1, 0.96, 1, 0.98, 1] }
                : { scaleX: 1, scaleY: 1 }
          }
          transition={{
            duration: state === "speaking" ? 0.48 : 1.05,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <path
            d={smilePath}
            fill="none"
            stroke={`url(#${smileGradId})`}
            strokeWidth="15"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${purpleGlowId})`}
          />
          <path
            d={smileHighlight}
            fill="none"
            stroke="#fff9dc"
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.5"
          />
        </motion.g>

        {/* Mascot face — floats inside the smile */}
        <motion.g
          animate={
            state === "thinking"
              ? { y: [-3, -6, -3], x: [0, 1, 0] }
              : state === "speaking"
                ? { y: [0, 1.5, 0] }
                : { y: [0, -1.2, 0] }
          }
          transition={{
            duration: state === "thinking" ? 2.2 : state === "speaking" ? 0.55 : 3.6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {/* Eyes — glance upward while thinking */}
          <motion.ellipse
            cx="46"
            cy="50"
            rx="4.4"
            ry="5.2"
            fill="#2a1752"
            animate={
              state === "thinking"
                ? { cy: 46, rx: 4, ry: 4.2 }
                : state === "idle" || state === "listening"
                  ? { ry: [5.2, 0.5, 5.2] }
                  : { cy: 50, rx: 4.4, ry: 5.2 }
            }
            transition={
              state === "idle" || state === "listening"
                ? { duration: 0.11, repeat: Infinity, repeatDelay: 4.5, ease: "easeInOut" }
                : { duration: 0.4 }
            }
          />
          <motion.ellipse
            cx="74"
            cy="50"
            rx="4.4"
            ry="5.2"
            fill="#2a1752"
            animate={
              state === "thinking"
                ? { cy: 46, rx: 4, ry: 4.2 }
                : state === "idle" || state === "listening"
                  ? { ry: [5.2, 0.5, 5.2] }
                  : { cy: 50, rx: 4.4, ry: 5.2 }
            }
            transition={
              state === "idle" || state === "listening"
                ? { duration: 0.11, repeat: Infinity, repeatDelay: 4.5, ease: "easeInOut" }
                : { duration: 0.4 }
            }
          />
          <circle cx="47.8" cy="48.2" r="1.3" fill="#ffffff" opacity="0.9" />
          <circle cx="75.8" cy="48.2" r="1.3" fill="#ffffff" opacity="0.9" />

          {/* Subtle mouth smile */}
          <motion.path
            d="M 50 58 Q 60 64 70 58"
            fill="none"
            stroke="#4c2d7a"
            strokeWidth="2.6"
            strokeLinecap="round"
            animate={
              state === "speaking"
                ? {
                    d: [
                      "M 50 58 Q 60 67 70 58",
                      "M 50 58 Q 60 61 70 58",
                      "M 50 58 Q 60 67 70 58",
                    ],
                  }
                : state === "listening"
                  ? {
                      d: [
                        "M 50 58 Q 60 63 70 58",
                        "M 50 58 Q 60 60 70 58",
                        "M 50 58 Q 60 63 70 58",
                      ],
                    }
                  : {}
            }
            transition={{
              duration: state === "speaking" ? 0.48 : 1.15,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </motion.g>
      </motion.svg>
    </div>
  );
}
