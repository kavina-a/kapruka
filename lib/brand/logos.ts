/** ChatRuka mascot assets — one per primary surface. */
export const BRAND_LOGOS = {
  chat: "/logos/chat-mascot.png",
  call: "/logos/call-mascot.png",
  track: "/logos/track-mascot.png",
} as const;

export type BrandLogoVariant = keyof typeof BRAND_LOGOS;

export const BRAND_LOGO_ALT: Record<BrandLogoVariant, string> = {
  chat: "ChatRuka — chat assistant",
  call: "ChatRuka — voice call",
  track: "ChatRuka — track your order",
};
