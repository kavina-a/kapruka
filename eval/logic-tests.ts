/**
 * Fast, deterministic unit tests for pure logic that the LLM-driven eval
 * suite (eval/run.ts) can't exercise cheaply — regexes and search-layer
 * pure functions. No network, no API key required.
 *
 * Usage: npx tsx eval/logic-tests.ts
 */
import { isGiftFinderUncertainty } from "../lib/chat/gift-finder";
import { isProductOffSeason } from "../lib/catalog/seasonal-filter";

let pass = 0;
let fail = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log("\n== isGiftFinderUncertainty — should MATCH (buyer is stuck) ==");
const shouldMatch = [
  "idk",
  "i dont know",
  "i don't know",
  "i dont really know",
  "i don't really know",
  "not sure",
  "not really sure",
  "no idea",
  "no clue",
  "you pick",
  "you choose",
  "you decide",
  "u pick",
  "surprise me",
  "whatever you think",
  "whatever works",
  "dunno",
  "haven't decided",
  "haven't really thought about it",
  "just pick something",
  "no preference",
  "hard to say",
  "beats me",
  "help me choose",
  "any suggestions?",
  "nothing specific in mind",
  "not a clue",
];
for (const phrase of shouldMatch) {
  check(`"${phrase}" → uncertain`, isGiftFinderUncertainty(phrase), true);
}

console.log("\n== isGiftFinderUncertainty — should NOT MATCH (buyer has direction) ==");
const shouldNotMatch = [
  "i want chocolates for my dad",
  "something for my dad",
  "he likes cologne",
  "get her red roses",
  "budget is 3000 rupees",
  "she loves KitKat chocolates",
  "flowers please",
];
for (const phrase of shouldNotMatch) {
  check(`"${phrase}" → not uncertain`, isGiftFinderUncertainty(phrase), false);
}

console.log("\n== isProductOffSeason — Father's Day branding ==");
// Father's Day 2026 = 3rd Sunday of June 2026 = 2026-06-21.
check(
  "Father's Day box in July → OFF season",
  isProductOffSeason("FATHER'S DAY LOVE YOU DAD 8 PIECE CHOCOLATE BOX", "2026-07-04"),
  true,
);
check(
  "Father's Day box in early June (within window) → IN season",
  isProductOffSeason("FATHER'S DAY LOVE YOU DAD 8 PIECE CHOCOLATE BOX", "2026-06-10"),
  false,
);
check(
  "Father's Day box in January → OFF season",
  isProductOffSeason("Java I Love Thaththa Father's Day Slab Box", "2026-01-15"),
  true,
);
check(
  "Plain dad chocolate box (no seasonal branding) → never off-season",
  isProductOffSeason("Java Super Dad 10 Piece Box", "2026-07-04"),
  false,
);
check(
  "Mother's Day box in July → OFF season",
  isProductOffSeason("Mother's Day Special Rose Bouquet", "2026-07-04"),
  true,
);
check(
  "Valentine's box in July → OFF season",
  isProductOffSeason("Valentine's Day Red Velvet Cake", "2026-07-04"),
  true,
);
check(
  "Christmas hamper in July → OFF season",
  isProductOffSeason("Christmas Special Fruit Hamper", "2026-07-04"),
  true,
);

console.log(`\n${"=".repeat(50)}`);
console.log(`  LOGIC TESTS: ${pass} passed, ${fail} failed`);
console.log("=".repeat(50) + "\n");

process.exit(fail > 0 ? 1 : 0);
