"use client";

import { useCommerce, type Lang } from "@/lib/commerce/store";

// Navigational chrome in EN / Sinhala / Tamil. Product strings from live MCP stay as-is.
type Entry = Record<Lang, string>;

export const STRINGS = {
  newGift: { en: "New gift", si: "නව තෑග්ග", ta: "புதிய பரிசு" },
  thisSession: { en: "Recent chats", si: "මෑත සංවාද", ta: "சமீபத்திய உரையாடல்கள்" },
  occasions: { en: "Occasions", si: "අවස්ථා", ta: "சந்தர்ப்பங்கள்" },
  savedRecipients: { en: "Saved recipients", si: "සුරැකි ලබන්නන්", ta: "சேமித்த பெறுநர்கள்" },
  noRecipients: {
    en: "Saved recipients show up here after your first order.",
    si: "ඔබේ පළමු ඇණවුමෙන් පසු සුරැකි ලබන්නන් මෙහි දිස්වේ.",
    ta: "உங்கள் முதல் ஆர்டருக்குப் பிறகு சேமித்த பெறுநர்கள் இங்கே தோன்றுவார்கள்.",
  },
  newConversation: { en: "New conversation", si: "නව සංවාදය", ta: "புதிய உரையாடல்" },
  language: { en: "Language", si: "භාෂාව", ta: "மொழி" },
  howItWorks: { en: "How it works", si: "ක්‍රියා කරන ආකාරය", ta: "எப்படி வேலை செய்கிறது" },
  privacy: { en: "Privacy", si: "පෞද්ගලිකත්වය", ta: "தனியுரிமை" },
  terms: { en: "Terms", si: "නියමයන්", ta: "விதிமுறைகள்" },
  callChatRuka: { en: "Call ChatRuka", si: "ChatRuka අමතන්න", ta: "ChatRuka-வை அழைக்கவும்" },
  trackOrder: { en: "Track order", si: "ඇණවුම සොයන්න", ta: "ஆர்டரைக் கண்டறியவும்" },
  composerPlaceholder: {
    en: "Tell ChatRuka who you're gifting…",
    si: "ඔබ කාටද තෑගි දෙන්නේ කියන්න…",
    ta: "யாருக்குப் பரிசு வேண்டும் என்று சொல்லுங்கள்…",
  },
  composerTagline: {
    en: "Forget the website. Just talk.",
    si: "වෙබ් අඩවිය අමතක කරන්න. කතා කරන්න.",
    ta: "வலைத்தளத்தை மறந்துவிடுங்கள். பேசுங்கள்.",
  },
  expand: { en: "Expand menu", si: "මෙනුව විහිදන්න", ta: "மெனுவை விரிக்கவும்" },
  collapse: { en: "Collapse menu", si: "මෙනුව හකුළන්න", ta: "மெனுவை சுருக்கவும்" },
} satisfies Record<string, Entry>;

export type StringKey = keyof typeof STRINGS;

/** Returns the current language and a translator bound to it. */
export function useT() {
  const lang = useCommerce((s) => s.lang);
  const t = (key: StringKey) => STRINGS[key][lang];
  return { lang, t };
}
