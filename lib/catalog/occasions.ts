// ---------------------------------------------------------------------------
// Curated occasions / gift verticals.
//
// Kapruka's free-text search is brittle (a bare keyword often returns nothing),
// but pairing a query with a category is far more reliable, and browsing the
// category landing pages is rock solid. So discovery is anchored on these
// curated occasions — which also happens to be the right product model: a gift
// concierge thinks in occasions, not search terms ("curated discovery, not a
// search box").
//
// `pageSlug` is the kapruka.com/online/<slug> landing page (used to harvest the
// seed catalog). `mcpCategory` + `query` are the verified-reliable arguments to
// kapruka_search_products. `keywords` drive free-text -> occasion inference.
// ---------------------------------------------------------------------------

export type OccasionKind = "occasion" | "type";

export interface Occasion {
  id: string;
  label: string;
  emoji: string;
  /** A short, warm one-liner Ruka can lean on. */
  blurb: string;
  kind: OccasionKind;
  pageSlug: string;
  mcpCategory: string;
  query: string;
  keywords: string[];
  /**
   * For recipient-based occasions (father, mother, etc.) whose MCP category
   * may return few results, these product-vertical IDs are tried in order
   * as search fallbacks when the primary category comes back empty.
   */
  fallbackOccasionIds?: string[];
}

export const OCCASIONS: Occasion[] = [
  {
    id: "birthday",
    label: "Birthday",
    emoji: "🎂",
    blurb: "Make the day land — cakes, surprises and the little big gestures.",
    kind: "occasion",
    pageSlug: "birthday",
    mcpCategory: "birthday",
    query: "birthday",
    keywords: ["birthday", "bday", "born", "turning", "another year", "upandi", "සුභ උපන්දිනය", "happy birthday"],
  },
  {
    id: "anniversary",
    label: "Anniversary",
    emoji: "💞",
    blurb: "Years are worth marking properly. Let's not phone it in.",
    kind: "occasion",
    pageSlug: "anniversary",
    mcpCategory: "anniversary",
    query: "anniversary",
    keywords: ["anniversary", "years together", "married", "wedding anniversary"],
  },
  {
    id: "romance",
    label: "Love & Romance",
    emoji: "🌹",
    blurb: "For the person who already has your heart. Go a little bold.",
    kind: "occasion",
    pageSlug: "lover",
    mcpCategory: "lover",
    query: "lover",
    keywords: ["romance", "romantic", "lover", "girlfriend", "boyfriend", "valentine", "valentines", "crush", "partner", "date", "i love you", "wife", "husband", "fiance", "fiancee"],
  },
  {
    id: "wedding",
    label: "Wedding",
    emoji: "💍",
    blurb: "A gift that says you showed up — and you meant it.",
    kind: "occasion",
    pageSlug: "wedding",
    mcpCategory: "wedding",
    query: "wedding",
    keywords: ["wedding", "getting married", "newlywed", "bride", "groom", "marriage", "homecoming"],
  },
  {
    id: "mother",
    label: "For Mum",
    emoji: "🌸",
    blurb: "Mums clock effort instantly. We'll get this right.",
    kind: "occasion",
    pageSlug: "mother",
    mcpCategory: "mother",
    query: "mother",
    keywords: ["mother", "mum", "mom", "amma", "mothers day", "mummy", "for my mother"],
    fallbackOccasionIds: ["flowers", "chocolates", "perfumes", "jewellery", "fruit"],
  },
  {
    id: "father",
    label: "For Dad",
    emoji: "👔",
    blurb: "Something he'll actually use or genuinely enjoy — not another mug.",
    kind: "occasion",
    pageSlug: "father",
    mcpCategory: "father",
    query: "father",
    keywords: [
      "father", "dad", "fathers day", "father's day", "thaththa", "appachchi", "appa",
      "for my dad", "for my father", "for dad", "dads birthday", "dad's birthday",
    ],
    // father may not be a Kapruka MCP category; fall through to popular dad-gift verticals
    fallbackOccasionIds: ["chocolates", "perfumes", "fruit", "cakes", "flowers"],
  },
  {
    id: "newborn",
    label: "New Baby",
    emoji: "🍼",
    blurb: "Soft, sweet and useful — for the tiny human and the tired parents.",
    kind: "occasion",
    pageSlug: "baby",
    mcpCategory: "BabyItems",
    query: "baby",
    keywords: ["baby", "newborn", "new baby", "christening", "baby shower", "infant", "nursery"],
  },
  {
    id: "sympathy",
    label: "Sympathy",
    emoji: "🤍",
    blurb: "When words run out, presence speaks. Tasteful, never flashy.",
    kind: "occasion",
    pageSlug: "sympathies",
    mcpCategory: "sympathies",
    query: "sympathy",
    keywords: ["sympathy", "condolence", "condolences", "funeral", "loss", "passed away", "grief", "bereavement"],
  },
  {
    id: "corporate",
    label: "Corporate",
    emoji: "🤝",
    blurb: "Client, colleague or boss — polished, on-brand, never awkward.",
    kind: "occasion",
    pageSlug: "corporate",
    mcpCategory: "corporate",
    query: "corporate",
    keywords: ["corporate", "client", "colleague", "boss", "office", "business", "coworker", "thank you gift", "professional"],
  },
  {
    id: "cakes",
    label: "Cakes",
    emoji: "🍰",
    blurb: "The centrepiece. Order early — the good ones need a day's notice.",
    kind: "type",
    pageSlug: "cakes",
    mcpCategory: "cakes",
    query: "cake",
    keywords: ["cake", "cakes", "gateau", "ribbon cake", "chocolate cake", "butter cake"],
  },
  {
    id: "flowers",
    label: "Flowers",
    emoji: "💐",
    blurb: "Always a yes. Fresh, perishable — we'll watch the delivery date.",
    kind: "type",
    pageSlug: "flowers",
    mcpCategory: "flowers",
    query: "flower",
    keywords: [
      "flower", "flowers", "bouquet", "roses", "rose", "lily", "lilies", "arrangement", "bloom",
      "tulip", "tulips", "sunflower", "sunflowers", "orchid", "orchids",
      "carnation", "carnations", "gerbera", "gerberas", "daisy", "daisies",
      "peony", "peonies", "lavender", "freesia", "hyacinth", "chrysanthemum",
      "anthurium", "calla", "pansy", "pansies", "floral", "fresh flowers",
      "flower arrangement", "flower bouquet",
    ],
  },
  {
    id: "chocolates",
    label: "Chocolates",
    emoji: "🍫",
    blurb: "Reliably loved. The safe bet that never feels lazy if you choose well.",
    kind: "type",
    pageSlug: "chocolates",
    mcpCategory: "Chocolates",
    query: "chocolate",
    keywords: ["chocolate", "chocolates", "truffles", "cadbury", "toblerone", "sweets", "candy"],
  },
  {
    id: "perfumes",
    label: "Perfume",
    emoji: "🧴",
    blurb: "Personal and a little intimate — a confident pick for someone you know well.",
    kind: "type",
    pageSlug: "perfumes",
    mcpCategory: "Perfumes",
    query: "perfume",
    keywords: ["perfume", "fragrance", "cologne", "scent", "eau de", "edt", "edp"],
  },
  {
    id: "fruit",
    label: "Fruit & Hampers",
    emoji: "🧺",
    blurb: "Generous and wholesome — great for families and 'get well soon'.",
    kind: "type",
    pageSlug: "fruitbaskets",
    mcpCategory: "Fruits",
    query: "fruit",
    keywords: ["fruit", "fruits", "hamper", "basket", "fruit basket", "get well", "healthy"],
  },
  {
    id: "jewellery",
    label: "Jewellery",
    emoji: "💎",
    blurb: "When you want it to feel like a moment. Mind the budget — happy to.",
    kind: "type",
    pageSlug: "jewellery",
    mcpCategory: "Jewellery",
    query: "jewellery",
    keywords: ["jewellery", "jewelry", "necklace", "bracelet", "earrings", "ring", "pendant", "gold"],
  },
  {
    id: "toys",
    label: "Toys & Soft Toys",
    emoji: "🧸",
    blurb: "For the kids (and the soft-hearted grown-ups). Cuddly wins.",
    kind: "type",
    pageSlug: "softtoy",
    mcpCategory: "Softtoy",
    query: "toy",
    keywords: ["toy", "toys", "teddy", "soft toy", "plush", "stuffed", "kids", "children", "child", "batman", "spider man", "spiderman", "superhero", "action figure"],
  },
];

export const OCCASIONS_BY_ID: Record<string, Occasion> = Object.fromEntries(
  OCCASIONS.map((o) => [o.id, o]),
);

/** Best-effort map of free text to a curated occasion. Uses word boundaries to avoid false matches. */
export function inferOccasion(text: string): Occasion | null {
  const t = ` ${text.toLowerCase()} `;
  let best: { occasion: Occasion; score: number } | null = null;
  for (const occasion of OCCASIONS) {
    let score = 0;
    for (const kw of occasion.keywords) {
      const k = kw.toLowerCase();
      const wordBoundary = new RegExp(`(?:^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`);
      if (wordBoundary.test(t) || t.includes(` ${k} `)) {
        score += kw.length;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { occasion, score };
    }
  }
  return best?.occasion ?? null;
}

/** Resolve an occasion by id OR by matching a category name. */
export function findOccasion(idOrCategory?: string | null): Occasion | null {
  if (!idOrCategory) return null;
  const key = idOrCategory.toLowerCase();
  return (
    OCCASIONS.find((o) => o.id === key) ??
    OCCASIONS.find((o) => o.mcpCategory.toLowerCase() === key) ??
    OCCASIONS.find((o) => o.label.toLowerCase() === key) ??
    null
  );
}
