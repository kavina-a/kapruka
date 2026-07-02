"use client";

import { useSyncExternalStore } from "react";

function subscribe(query: string, onChange: () => void) {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True when viewport is below Tailwind's `md` breakpoint (768px). */
export function useIsMobileMd() {
  const query = "(max-width: 767px)";
  return useSyncExternalStore(
    (cb) => subscribe(query, cb),
    () => window.matchMedia(query).matches,
    () => false,
  );
}
