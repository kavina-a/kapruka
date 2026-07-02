import { BrandMascot } from "@/components/brand/BrandMascot";
import type { BrandLogoVariant } from "@/lib/brand/logos";
import { cn } from "@/lib/utils";

interface RukaAvatarProps {
  size?: number;
  className?: string;
  glow?: boolean;
  /** Show the yellow smile pulse — used while the AI is generating / thinking. */
  thinking?: boolean;
  /** Which mascot to show — defaults to chat. */
  variant?: BrandLogoVariant;
}

/** ChatRuka mascot avatar used in chat, voice, and tracking surfaces. */
export function RukaAvatar({
  size = 40,
  className,
  glow = false,
  thinking = false,
  variant = "chat",
}: RukaAvatarProps) {
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-white/90",
        glow && "ring-1 ring-brand-700/25 shadow-sm",
        thinking && "avatar-thinking",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <BrandMascot variant={variant} size={Math.round(size * 0.92)} className="pointer-events-none" />
    </span>
  );
}
