"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface SmartImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  /** Aspect wrapper class, e.g. "aspect-square". */
  wrapperClassName?: string;
  sizes?: string;
}

/**
 * Image that never shows a broken/gray box: shimmer while loading, and a
 * branded fallback (the wish-tree mark) if the source is missing or errors.
 */
export function SmartImage({ src, alt, className, wrapperClassName }: SmartImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(src ? "loading" : "error");

  useEffect(() => {
    setStatus(src ? "loading" : "error");
  }, [src]);

  return (
    <div className={cn("relative overflow-hidden bg-canvas-3", wrapperClassName)}>
      {status === "loading" && <div className="absolute inset-0 shimmer" />}
      {status === "error" ? (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-canvas-3 to-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ruka-mark.svg" alt="" className="size-12 opacity-50" />
        </div>
      ) : (
        // Kapruka's CDN already serves optimised/resized images; a plain <img>
        // avoids Next image-optimisation quotas and works reliably on Vercel.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src ?? undefined}
          alt={alt}
          loading="lazy"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={cn(
            // Product photos arrive on white; contain (don't crop) so each sits
            // cleanly on its mat — the catalogue look.
            "h-full w-full object-contain transition-opacity duration-500",
            status === "loaded" ? "opacity-100" : "opacity-0",
            className,
          )}
        />
      )}
    </div>
  );
}
