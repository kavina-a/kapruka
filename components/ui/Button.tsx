"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "gold" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-700 text-white hover:bg-brand-600 active:bg-brand-900 shadow-sm",
  gold: "bg-gold-500 text-ink-dark hover:bg-gold-400 active:bg-gold-600 font-semibold shadow-sm",
  ghost: "bg-transparent text-ink hover:bg-canvas-3",
  outline: "bg-transparent text-ink border border-line-strong hover:bg-canvas-3",
  danger: "bg-rose-500 text-white hover:bg-rose-400 active:bg-rose-600",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm rounded-xl gap-1.5",
  md: "h-11 px-5 text-sm rounded-2xl gap-2",
  lg: "h-12 px-6 text-base rounded-2xl gap-2",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-200 select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:opacity-50 disabled:pointer-events-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
