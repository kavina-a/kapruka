"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface ToastItem {
  id: string;
  message: string;
  icon?: string;
}

interface ToastContextValue {
  toast: (message: string, icon?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, icon?: string) => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev, { id, message, icon }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-90 flex -translate-x-1/2 flex-col items-center gap-2">
        <AnimatePresence mode="popLayout">
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ type: "spring", damping: 28, stiffness: 360 }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-brand-700/20 bg-brand-700 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
            >
              {item.icon && <span className="text-base leading-none">{item.icon}</span>}
              <span>{item.message}</span>
              <button
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss"
                className="ml-1 grid size-5 place-items-center rounded-full opacity-60 transition hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
