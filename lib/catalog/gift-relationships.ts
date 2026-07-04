/** Quick "who's this for?" chips — separate from Kapruka product verticals. */

export interface GiftRelationship {
  id: string;
  label: string;
  emoji: string;
  /** Words to detect in chat for pre-fill. */
  keywords: string[];
}

export const GIFT_RELATIONSHIPS: GiftRelationship[] = [
  { id: "mother", label: "Mum / Mom", emoji: "👩", keywords: ["mom", "mum", "mother", "amma", "mummy"] },
  { id: "father", label: "Dad", emoji: "👨", keywords: ["dad", "father", "appa", "daddy"] },
  { id: "partner", label: "Partner", emoji: "💑", keywords: ["wife", "husband", "partner", "girlfriend", "boyfriend", "spouse"] },
  { id: "friend", label: "Friend", emoji: "🤝", keywords: ["friend", "buddy", "mate"] },
  { id: "sibling", label: "Sibling", emoji: "👫", keywords: ["sister", "brother", "sibling"] },
  { id: "colleague", label: "Colleague", emoji: "💼", keywords: ["colleague", "coworker", "boss", "client"] },
  { id: "child", label: "Child", emoji: "👶", keywords: ["son", "daughter", "kid", "child"] },
  { id: "grandparent", label: "Grandparent", emoji: "👴", keywords: ["grandma", "grandpa", "grandmother", "grandfather", "nana"] },
  { id: "self", label: "Myself", emoji: "🙋", keywords: ["myself", "for me", "treat myself"] },
];

export const GIFT_RELATIONSHIPS_BY_ID = Object.fromEntries(
  GIFT_RELATIONSHIPS.map((r) => [r.id, r]),
) as Record<string, GiftRelationship>;
