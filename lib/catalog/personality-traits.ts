/** ~10 personality chips for the gift finder — map to Kapruka search verticals. */

export interface PersonalityTrait {
  id: string;
  label: string;
  emoji: string;
  /** Kapruka occasion ids to search (lib/catalog/occasions.ts). */
  relatedOccasionIds: string[];
  keywords: string[];
}

export const PERSONALITY_TRAITS: PersonalityTrait[] = [
  {
    id: "sweet-tooth",
    label: "Loves sweets & treats",
    emoji: "🍫",
    relatedOccasionIds: ["chocolates", "cakes", "fruit"],
    keywords: ["chocolate", "sweet", "hamper", "cake"],
  },
  {
    id: "nature-lover",
    label: "Outdoorsy & nature",
    emoji: "🌿",
    relatedOccasionIds: ["flowers", "fruit"],
    keywords: ["flowers", "plants", "hamper", "fresh"],
  },
  {
    id: "stylish",
    label: "Fashion & style",
    emoji: "✨",
    relatedOccasionIds: ["jewellery", "perfumes"],
    keywords: ["jewellery", "perfume", "accessories", "elegant"],
  },
  {
    id: "cozy-homebody",
    label: "Cozy at home",
    emoji: "🏡",
    relatedOccasionIds: ["fruit", "chocolates"],
    keywords: ["hamper", "candle", "comfort", "home"],
  },
  {
    id: "practical",
    label: "Useful & practical",
    emoji: "🔧",
    relatedOccasionIds: ["fruit", "corporate"],
    keywords: ["useful", "hamper", "essentials", "gift set"],
  },
  {
    id: "sentimental",
    label: "Sentimental & heartfelt",
    emoji: "💝",
    relatedOccasionIds: ["flowers", "chocolates"],
    keywords: ["flowers", "personal", "heartfelt", "roses"],
  },
  {
    id: "playful",
    label: "Fun & playful",
    emoji: "🎉",
    relatedOccasionIds: ["toys", "chocolates", "cakes"],
    keywords: ["fun", "toy", "novelty", "cake"],
  },
  {
    id: "wellness",
    label: "Wellness & self-care",
    emoji: "🧘",
    relatedOccasionIds: ["fruit", "perfumes"],
    keywords: ["spa", "wellness", "self-care", "relax"],
  },
  {
    id: "foodie",
    label: "Foodie & gourmet",
    emoji: "🍽️",
    relatedOccasionIds: ["fruit", "cakes", "chocolates"],
    keywords: ["gourmet", "hamper", "food", "delicacy"],
  },
  {
    id: "traditional",
    label: "Traditional & spiritual",
    emoji: "🪔",
    relatedOccasionIds: ["fruit", "flowers"],
    keywords: ["traditional", "spiritual", "blessing", "pooja"],
  },
  {
    id: "creative",
    label: "Creative & artsy",
    emoji: "🎨",
    relatedOccasionIds: ["toys", "chocolates"],
    keywords: ["creative", "unique", "handmade", "art"],
  },
  {
    id: "tech-curious",
    label: "Gadgets & modern",
    emoji: "📱",
    relatedOccasionIds: ["corporate", "toys"],
    keywords: ["gadget", "tech", "modern", "accessory"],
  },
];

export const PERSONALITY_TRAITS_BY_ID = Object.fromEntries(
  PERSONALITY_TRAITS.map((t) => [t.id, t]),
) as Record<string, PersonalityTrait>;
