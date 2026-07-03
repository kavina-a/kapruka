import { cn } from "@/lib/utils";

export interface ChatRukaLogoProps {
  /** Logo height in px — width scales from the wordmark aspect ratio. */
  height?: number;
  className?: string;
}

/** ChatRuka wordmark — white type with yellow smile on purple. */
export function ChatRukaLogo({ height = 36, className }: ChatRukaLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="ChatRuka"
      height={height}
      draggable={false}
      className={cn("w-auto object-contain", className)}
      style={{ height }}
    />
  );
}
