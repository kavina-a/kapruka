import { cn } from "@/lib/utils";
import { BRAND_LOGO_ALT, BRAND_LOGOS, type BrandLogoVariant } from "@/lib/brand/logos";

export interface BrandMascotProps {
  variant?: BrandLogoVariant;
  /** Square dimension in px — omit when using className for hero sizing. */
  size?: number;
  className?: string;
  alt?: string;
}

/** Kapruka mascot for chat, voice call, or order tracking surfaces. */
export function BrandMascot({
  variant = "chat",
  size,
  className,
  alt,
}: BrandMascotProps) {
  const sized = typeof size === "number";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BRAND_LOGOS[variant]}
      alt={alt ?? BRAND_LOGO_ALT[variant]}
      width={sized ? size : undefined}
      height={sized ? size : undefined}
      draggable={false}
      className={cn("object-contain", sized && "shrink-0", className)}
      style={sized ? { width: size, height: size } : undefined}
    />
  );
}
