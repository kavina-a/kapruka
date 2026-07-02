"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useIsMobileMd } from "@/lib/hooks/use-media-query";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  side?: "right" | "bottom";
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  side = "right",
  children,
  footer,
  widthClass = "w-full max-w-md",
}: DrawerProps) {
  const isMobile = useIsMobileMd();
  const effectiveSide = side === "right" && isMobile ? "bottom" : side;
  const isRight = effectiveSide === "right";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <motion.div
            className="absolute inset-0 bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className={cn(
              "glass relative z-10 flex flex-col shadow-xl",
              isRight
                ? cn("ml-auto h-full", widthClass)
                : "mt-auto w-full max-h-[92dvh] rounded-t-3xl",
            )}
            initial={isRight ? { x: "100%" } : { y: "100%" }}
            animate={isRight ? { x: 0 } : { y: 0 }}
            exit={isRight ? { x: "100%" } : { y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            {(title || true) && (
              <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 pt-safe">
                <div className="min-w-0 font-display text-lg text-ink">{title}</div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="grid size-11 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-canvas-3 hover:text-ink"
                >
                  <X className="size-5" />
                </button>
              </header>
            )}
            <div className="scroll-soft min-h-0 flex-1 overflow-y-auto">{children}</div>
            {footer && <div className="border-t border-line p-4 pb-safe">{footer}</div>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
