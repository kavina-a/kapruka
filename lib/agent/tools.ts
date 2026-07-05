import "server-only";
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import {
  checkDelivery,
  getGift,
  listDeliveryCities,
  resolveDeliveryCity,
  searchGifts,
  trackOrder,
  KaprukaError,
} from "@/lib/mcp/kapruka";
import { resolveProduct } from "@/lib/agent/resolve-product";
import { OCCASIONS } from "@/lib/catalog/occasions";
import { colomboToday } from "@/lib/commerce/dates";
import type { CommerceContext } from "@/lib/commerce/types";
import type { AgentMode } from "@/lib/agent/modes";
import type { GiftFinderState } from "@/lib/catalog/gift-finder-types";
import { interpretRefinement } from "@/lib/agent/classify";
import { applyGiftFinderToSearchInput } from "@/lib/agent/apply-gift-finder-search";
import { searchGiftsWithRecipientContext } from "@/lib/agent/enrich-search";
import { curateGiftPicks } from "@/lib/agent/curate-picks";
import { isGiftFinderComplete } from "@/lib/catalog/gift-finder-types";
import {
  agentLog,
  summarizeSearchInput,
  summarizeToolResult,
} from "@/lib/agent/log";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const OCCASION_IDS = OCCASIONS.map((o) => o.id) as [string, ...string[]];

function errorPayload(err: unknown) {
  if (err instanceof KaprukaError) {
    return { ok: false as const, error: err.message, code: err.code };
  }
  return {
    ok: false as const,
    error: err instanceof Error ? err.message : "Something went wrong.",
  };
}

function makeRemoveFromCartTool(cart?: Array<{ id: string; name: string }>) {
  return tool({
    description:
      "Remove a product from the buyer's cart when they ask ('remove that', 'take it out', 'I don't want the mug', 'ehema ganna epa'). Use productId from the live cart state or productName.",
    inputSchema: z.object({
      productId: z.string().optional().describe("Exact product id from the cart."),
      productName: z
        .string()
        .optional()
        .describe("Product name when id is unknown — matched against cart items."),
    }),
    execute: async ({ productId, productName }) => {
      if (!productId?.trim() && !productName?.trim()) {
        return { ok: false as const, error: "Tell me which item to remove — by name or which card." };
      }
      const items = cart ?? [];
      let matchId = productId?.trim();
      if (!matchId && productName?.trim()) {
        const norm = productName.toLowerCase();
        const hit = items.find(
          (p) =>
            p.name.toLowerCase() === norm ||
            p.name.toLowerCase().includes(norm) ||
            norm.includes(p.name.toLowerCase()),
        );
        matchId = hit?.id;
      }
      if (!matchId) {
        return { ok: false as const, error: "I couldn't find that in your basket." };
      }
      const name = items.find((p) => p.id === matchId)?.name ?? productName ?? "item";
      return { ok: true as const, productId: matchId, name };
    },
  });
}

function makeAddToCartTool(shownProducts?: Array<{ id: string; name: string }>) {
  return tool({
    description:
      "Add ONE product to the buyer's cart. ONLY call when they explicitly confirm they want to buy/add — e.g. 'add it', 'I'll take that', 'put it in the cart', 'yes that one', 'go with the first — add it', 'hodai', 'eka ganna'. NEVER call for preferences or context ('she loves kitkats', 'he likes wine', 'maybe that one', 'sounds nice') — those mean search or refine, not purchase. Recommending something in chat is NOT permission to add. One product per call unless they explicitly asked for multiple in one message. Use exact productId from searchGifts — never invent ids. After adding: say 'Done — in your basket' then MANDATORY post-cart moment (chocolates, card message, etc.) BEFORE mentioning checkout. Never say 'Shall we proceed to checkout?'",
    inputSchema: z.object({
      productId: z
        .string()
        .optional()
        .describe("Exact Kapruka product id from searchGifts cards, e.g. cake00ka001561."),
      productName: z
        .string()
        .optional()
        .describe("Product name when id is unknown — matched against recent results."),
      quantity: z.number().int().min(1).max(99).optional().describe("Defaults to 1."),
      icingText: z
        .string()
        .optional()
        .describe("For cakes only — message to write on the icing."),
    }),
    execute: async ({ productId, productName, quantity = 1, icingText }) => {
      if (!productId?.trim() && !productName?.trim()) {
        return { ok: false as const, error: "I need the product id or name to add it." };
      }
      try {
        const resolved = await resolveProduct({
          productId,
          productName,
          recentProducts: shownProducts,
        });
        if (!resolved) {
          return {
            ok: false as const,
            error: "I couldn't find that product — try tapping Add on the card, or tell me which one by name.",
          };
        }
        const { product, card } = resolved;
        if (!product.inStock) {
          return { ok: false as const, error: `${product.name} is out of stock right now.` };
        }
        return {
          ok: true as const,
          product: card,
          quantity,
          icingText: product.isCake ? icingText?.trim() || undefined : undefined,
          name: product.name,
        };
      } catch (err) {
        return errorPayload(err);
      }
    },
  });
}

function makeSearchGiftsTool(giftFinderState?: GiftFinderState | null) {
  const finderActive = isGiftFinderComplete(giftFinderState);
  const finderHint = finderActive
    ? "\n\nGIFT FINDER ACTIVE: the buyer completed the chip flow (relationship, personality, budget). " +
      "See 'Gift finder picks' in your system prompt. Call searchGifts ONCE — the system curates 4–6 picks " +
      "with per-card reasons automatically. Do NOT re-ask who it's for or their personality."
    : "";

  return tool({
    description:
      "Find products to show as image cards.\n\n" +
      "Kapruka search = product vertical (occasionId) × product keywords (query). Recipient/occasion → shopperNote ONLY.\n\n" +
      "⚠️ BEFORE ANYTHING ELSE — ambiguity check: if there is NO recipient, NO occasion, AND the product word itself doesn't map to a clear category ('spicy', 'something nice', 'a treat', 'something good') — do NOT call this tool. Ask one short question about the product first. RULE B below (guess the vertical) only applies when a recipient or occasion IS known but the product isn't — it does NOT license guessing a category for a vague self-purchase word. Guessing occasionId:'chocolates' for an unrelated word like 'spicy' is the most common quality failure — never do it.\n\n" +
      "RULE A — product type stated → use PRODUCT VERTICAL as occasionId:\n" +
      "  'perfume for dad' → occasionId:'perfumes', query:'men cologne', shopperNote:'A cologne for Dad'\n" +
      "  'chocolates for mum' → occasionId:'chocolates', shopperNote:'Something sweet for Mum'\n" +
      "  'flowers for my wife' → occasionId:'flowers'\n" +
      "  'jewellery for sis birthday' → occasionId:'jewellery', shopperNote:'Birthday gift for her sister'\n\n" +
      "RULE B — only occasion/recipient known, NO product hint → USE YOUR OWN KNOWLEDGE to pick the best product vertical:\n" +
      "  Do NOT just pass occasionId:'father' and hope. Think: what do people actually buy for this?\n" +
      "  'Father's Day gift' → dads: chocolates, cologne, hampers → pick occasionId:'chocolates' (or 'perfumes' or 'fruit')\n" +
      "  'something for grandma' → flowers or chocolates → occasionId:'flowers'\n" +
      "  'anniversary, no product hint' → occasionId:'flowers' or 'jewellery' — NOT 'anniversary' (Kapruka's anniversary category is mostly cakes)\n" +
      "  'birthday for a friend, no hint' → occasionId:'birthday' (Kapruka has this and it works well)\n" +
      "  Kapruka occasions with DEDICATED categories (use these directly): birthday, wedding, mother, corporate, romance, sympathy, newborn\n" +
      "  ⚠️ 'anniversary' category → returns mostly cakes — prefer occasionId:'flowers' or 'jewellery' unless the buyer specifically wants cake\n" +
      "  For all others: infer the likely product type yourself, then search that vertical.\n\n" +
      "RULE C — both known → product vertical wins:\n" +
      "  'jewellery for mum's birthday' → occasionId:'jewellery', not 'birthday'\n\n" +
      "NEVER put recipient words (dad, mum, brother, friend) in `query` — it breaks the search engine.\n" +
      "ALWAYS put who it's for in shopperNote.\n\n" +
      "REJECTION RULE (critical): If the user just rejected the results ('not cake', 'no flowers', 'avoid X'):\n" +
      "  1. Call rememberRecipientDislike first.\n" +
      "  2. Switch to a COMPLETELY DIFFERENT occasionId — NEVER repeat the same occasionId you just used.\n" +
      "  3. MCP results are cached for 30 minutes — retrying the same search returns IDENTICAL products.\n" +
      "  Cake rejected → try occasionId:'flowers' or 'jewellery' or 'perfumes'\n" +
      "  Flowers rejected → try occasionId:'chocolates' or 'jewellery' or 'perfumes'\n" +
      "  Chocolates rejected → try occasionId:'flowers' or 'jewellery' or 'fruit'\n\n" +
      "CATEGORY ANCHORING (critical — omitting this causes garbage results):\n" +
      "  any flower variety → occasionId:'flowers' | any cake type → occasionId:'cakes'\n" +
      "  any chocolate → occasionId:'chocolates' | any fragrance/cologne → occasionId:'perfumes'\n\n" +
      "QUERY TIPS (Kapruka search quirks):\n" +
      "  flowers: use singular product term in query — 'rose' not 'roses', 'lily' not 'lilies'\n" +
      "  cakes: use specific type — 'chocolate cake', 'ribbon cake', 'cupcake' (not just 'cake')\n" +
      "  sympathy: query 'sympathy flowers' or 'condolence' — occasionId:'sympathy'\n" +
      "  alternative queries: supply alternativeQueries for niche items — e.g. ['rose bouquet','red rose'] for rose searches\n\n" +
      "ALTERNATIVES: matchQuality 'related' → max 3 cards, positive shopperNote, ONE question after.\n" +
      "POST-CART: one complement offer BEFORE checkout. Never 'Shall we proceed?'" +
      finderHint,
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Free-text intent, e.g. 'something elegant for my mum' or 'red roses'."),
      occasionId: z
        .enum(OCCASION_IDS)
        .optional()
        .describe("The gifting occasion / vertical to anchor the search on."),
      shopperNote: z
        .string()
        .max(140)
        .optional()
        .describe(
          "Personalized caption above the product cards — mirror their request in warm language.",
        ),
      alternativeQueries: z
        .array(z.string())
        .max(4)
        .optional()
        .describe(
          "Fallback searches if the exact product is missing — e.g. ['batman bag', 'spider man toy'].",
        ),
      minPrice: z.number().optional().describe("Minimum price in LKR."),
      maxPrice: z.number().optional().describe("Maximum (budget) price in LKR."),
      inStockOnly: z.boolean().optional(),
      sort: z
        .enum(["relevance", "price_asc", "price_desc", "newest", "bestseller"])
        .optional(),
    }),
    execute: async ({ shopperNote, ...input }) => {
      agentLog("tool.call", {
        tool: "searchGifts",
        args: summarizeSearchInput({ ...input, shopperNote }),
        giftFinderActive: finderActive,
      });
      try {
        // Chip-selected budget/traits are structured ground truth — enforce the
        // budget deterministically (no LLM guesswork) and only fill gaps the
        // model left blank, never override what it explicitly chose.
        const effectiveInput = applyGiftFinderToSearchInput(input, giftFinderState);

        agentLog("tool.search_effective_input", {
          tool: "searchGifts",
          effective: summarizeSearchInput(effectiveInput as Record<string, unknown>),
        }, "debug");

        const res = await searchGiftsWithRecipientContext({
          input: effectiveInput,
          limit: finderActive ? 12 : 8,
          recipientContext: {
            shopperNote,
            giftFinderState,
          },
        });
        const isSubstitution = res.matchQuality === "related";
        const productLimit = isSubstitution ? 3 : finderActive ? 12 : 8;
        const note = shopperNote?.trim() || res.note;

        let products = res.products.slice(0, productLimit);
        let pickReasons: Record<string, string> | undefined;

        if (finderActive && giftFinderState && products.length) {
          const curated = await curateGiftPicks(products, giftFinderState);
          products = curated.products;
          pickReasons = curated.pickReasons;
        } else {
          products = products.slice(0, isSubstitution ? 3 : 8);
        }

        // Rate limit — stop here. Returning seed results as a substitute when
        // search is down is misleading; the model should tell the user honestly.
        if (res.rateLimited) {
          const rateLimitedPayload = {
            ok: false as const,
            error: "rate_limited" as const,
            message: "Search is temporarily unavailable due to rate limiting.",
          };
          agentLog("tool.result", summarizeToolResult("searchGifts", rateLimitedPayload), "warn");
          return rateLimitedPayload;
        }

        const payload = {
          ok: true as const,
          source: res.source,
          occasion: res.occasion,
          note,
          pickReasons,
          matchQuality: res.matchQuality,
          searchedFor: res.searchedFor,
          count: products.length,
          products,
        };
        agentLog("tool.result", summarizeToolResult("searchGifts", payload));
        return payload;
      } catch (err) {
        const errPayload = errorPayload(err);
        agentLog("tool.error", { tool: "searchGifts", ...errPayload }, "error");
        return errPayload;
      }
    },
  });
}

function makeRefineGiftFinderTool(giftFinderState: GiftFinderState) {
  return tool({
    description:
      "Call when the buyer sends a short free-text tweak to their gift-finder search — e.g. " +
      "'something cheaper', 'more outdoorsy options', 'no chocolates please', 'she doesn't like jewellery'. " +
      "Only use this when a gift finder session exists (see 'Gift finder picks' in your system prompt) and " +
      "the message is clearly adjusting it, not starting a brand-new search. This tool ONLY updates the " +
      "stored picks — it does not search. ALWAYS follow it with a searchGifts call using the updated criteria.",
    inputSchema: z.object({
      feedbackText: z.string().describe("The buyer's exact tweak request, verbatim."),
    }),
    execute: async ({ feedbackText }) => {
      const patch = await interpretRefinement(feedbackText, giftFinderState);
      if (!patch || Object.keys(patch).length === 0) {
        return {
          ok: false as const,
          error: "Couldn't tell what to change — ask them to be a bit more specific.",
        };
      }
      return { ok: true as const, patch };
    },
  });
}

export const rukaTools = {
  searchGifts: makeSearchGiftsTool(),

  getGiftDetails: tool({
    description:
      "Get full details (description, all images, variants, stock) for one product by its id. Use when the customer asks about a specific item.",
    inputSchema: z.object({
      productId: z.string().describe("The Kapruka product id from a card."),
    }),
    execute: async ({ productId }) => {
      try {
        const product = await getGift(productId);
        return { ok: true as const, product };
      } catch (err) {
        return errorPayload(err);
      }
    },
  }),

  addToCart: makeAddToCartTool(),

  removeFromCart: makeRemoveFromCartTool(),

  listOccasions: tool({
    description: "List the gifting occasions and gift types you can browse.",
    inputSchema: z.object({}),
    execute: async () => ({
      ok: true as const,
      occasions: OCCASIONS.map((o) => ({
        id: o.id,
        label: o.label,
        emoji: o.emoji,
        blurb: o.blurb,
        kind: o.kind,
      })),
    }),
  }),

  findDeliveryCities: tool({
    description:
      "Look up Kapruka delivery cities by name or vernacular alias to confirm a place is serviceable. Kapruka requires EXACT zone names — 'Colombo' alone fails; use 'Colombo 03' (Kolpity), 'Colombo 07', etc. Always call this before checkDelivery or checkout when the buyer gives a city in chat.",
    inputSchema: z.object({
      query: z.string().describe("City name or alias, e.g. 'Kolpity' or 'Kandy'."),
    }),
    execute: async ({ query }) => {
      try {
        const cities = await listDeliveryCities(query, 12);
        return { ok: true as const, count: cities.length, cities };
      } catch (err) {
        return errorPayload(err);
      }
    },
  }),

  checkDelivery: tool({
    description:
      "Check real delivery availability, the flat LKR delivery fee, and any perishable warning for a specific city + date. " +
      "Call ONCE per query. If the buyer asks 'how long does delivery take' or a general timeframe question — answer from knowledge first " +
      "(Kapruka delivers same-day for orders placed before ~11 AM Sri Lanka time, otherwise next-day in Colombo; " +
      "2–3 days for outstations) then call this to confirm a specific date. " +
      "Only call twice when the first date fails AND you want to suggest the next available day — otherwise one call is enough. " +
      "City must be an exact Kapruka zone (e.g. 'Colombo 03') — run findDeliveryCities first if unsure.",
    inputSchema: z.object({
      city: z
        .string()
        .describe("Exact Kapruka delivery city from findDeliveryCities, e.g. 'Colombo 03' or 'Kandy'."),
      date: z
        .string()
        .describe(`Delivery date YYYY-MM-DD (Asia/Colombo). Today is ${colomboToday()}.`),
      productId: z
        .string()
        .optional()
        .describe("Optional product id to get a perishable (cake/flower) warning."),
    }),
    execute: async ({ city, date, productId }) => {
      try {
        const quote = await checkDelivery(city, date, productId);
        return { ok: true as const, quote };
      } catch (err) {
        return errorPayload(err);
      }
    },
  }),

  trackOrder: tool({
    description:
      "Track an existing Kapruka order by its order number (from the customer's confirmation email).",
    inputSchema: z.object({
      orderNumber: z.string().describe("Kapruka order number from the confirmation email."),
    }),
    execute: async ({ orderNumber }) => {
      try {
        const order = await trackOrder(orderNumber);
        return { ok: true as const, order };
      } catch (err) {
        return errorPayload(err);
      }
    },
  }),

  updateBuyerProfile: tool({
    description:
      "When the BUYER tells you their own name, city, or country (e.g. 'I'm Kavina', 'I'm calling from the UK', 'I'm in Kandy') during conversation, call this to persist it. Only for the BUYER themselves — not for the gift recipient.",
    inputSchema: z.object({
      name: z.string().optional().describe("Buyer's first name as they stated it."),
      city: z.string().optional().describe("Buyer's home city in Sri Lanka, e.g. 'Colombo'."),
      country: z
        .string()
        .optional()
        .describe(
          "Country the buyer is ordering from if outside Sri Lanka, e.g. 'UK', 'Australia', 'UAE'.",
        ),
    }),
    execute: async (input) => ({ ok: true as const, ...input }),
  }),

  updateCheckoutDetails: tool({
    description:
      "Update checkout/delivery form fields from conversation. Call when the user provides recipient name, phone, address, city, delivery date, sender name, gift message, or delivery notes via text — even if a checkout form is already visible. Parse natural language (e.g. 'deliver to Amma at 45 Galle Rd Colombo 0771234567 on Dec 25'). For city: NEVER save vague names like 'Colombo' — run findDeliveryCities first and use the exact zone (e.g. 'Colombo 03'). After calling, ALWAYS follow with showCheckoutForm step 'confirm' and highlightFields for fields you just set, then ask in one short sentence whether the filled form looks right or what they'd like to change.",
    inputSchema: z.object({
      recipientName: z.string().optional(),
      recipientPhone: z.string().optional(),
      address: z.string().optional(),
      city: z
        .string()
        .optional()
        .describe("Exact Kapruka delivery city — e.g. 'Colombo 03', not 'Colombo'."),
      locationType: z.enum(["house", "apartment", "office", "other"]).optional(),
      date: z.string().optional().describe("Delivery date YYYY-MM-DD (Asia/Colombo)."),
      instructions: z.string().optional(),
      senderName: z.string().optional().describe("Buyer's name for the gift card — NOT the recipient."),
      anonymous: z.boolean().optional(),
      giftMessage: z.string().optional(),
    }),
    execute: async (input) => {
      const out = { ...input };
      if (input.city?.trim()) {
        const resolved = await resolveDeliveryCity(input.city);
        if (!resolved.ok) {
          return {
            ok: false as const,
            error: resolved.message,
            code: resolved.code,
            suggestions: resolved.suggestions.map((c) => c.name),
          };
        }
        out.city = resolved.city;
      }
      return { ok: true as const, ...out };
    },
  }),

  showCheckoutForm: tool({
    description:
      "Show the interactive checkout card in the chat thread. step 'review': basket summary when user wants to checkout. step 'collect': editable delivery form (pre-filled from conversation). step 'confirm': read-only summary after details captured — ask if it looks right. step 'payment': after order is placed (rare — usually user clicks Confirm in the form). User can fill the form directly OR tell you details in chat — both stay in sync via updateCheckoutDetails.",
    inputSchema: z.object({
      step: z.enum(["review", "collect", "confirm", "payment"]),
      highlightFields: z
        .array(z.string())
        .optional()
        .describe(
          "Field keys just updated from chat, e.g. ['recipientName','address','city'] — briefly highlights them in the form.",
        ),
    }),
    execute: async (input) => ({ ok: true as const, ...input }),
  }),

  showGiftFinder: tool({
    description:
      "Show the structured gift finder (relationship → personality → budget) when the buyer has no idea what to get — whether or not a recipient/occasion is already known. " +
      "Trigger signals: 'idk', 'I don't know', 'no idea', 'nothing in mind', 'nothing specific', 'not sure what to get', " +
      "'you pick', 'you decide', 'surprise me', 'open to anything', 'dunno', 'whatever you think', 'recommend something', 'suggest something'. " +
      "Rules: (1) Do NOT call searchGifts in the same turn as this. " +
      "(2) It IS fine to call this on the very first user message IF that message already has zero recipient/occasion/product context " +
      "(e.g. 'I need a gift for someone but I have no idea what, surprise me') OR if the message names a recipient but ALSO already expresses uncertainty in the same breath (e.g. 'something for my sister, no idea what she'd like'). " +
      "(3) If a recipient/occasion is named WITHOUT any uncertainty language (e.g. plain 'something for my dad'), do NOT call this yet — the correct first move is ONE clarifying question ('Do you have something in mind for him, or would you like me to suggest a few things?'), with no tool call at all. Only call showGiftFinder on their NEXT reply if that reply is uncertain ('I don't know', 'you pick', 'recommend something'). If their reply instead gives a taste/product hint, call searchGifts for that instead. " +
      "(4) Only call ONCE per session — if you already called it and the buyer is STILL unsure afterward, call searchGifts with a fresh occasionId instead; do not re-open the picker. " +
      "After calling, say one warm line only — e.g. 'No worries — pick a few things about them and I'll pull curated ideas.' " +
      "Never search before they finish the picker chips.",
    inputSchema: z.object({}),
    execute: async () => ({ ok: true as const }),
  }),

  suggestGiftMessage: tool({
    description:
      "Write and apply a gift card message (max 300 characters) based on the conversation — recipient, occasion, relationship, and tone. Call when the user asks for help wording the card, says they don't know what to write, wants something heartfelt, or you're nearing checkout and no message exists yet. The message is auto-filled for checkout; they can remove it with one tap. Write as the buyer TO the recipient — warm, specific, never generic. Match their language (Sinhala/Tanglish if they've been using it). After calling, say one short line inviting them to keep it, tweak it, or remove it.",
    inputSchema: z.object({
      message: z
        .string()
        .max(300)
        .describe("The gift card message — first person from buyer to recipient."),
    }),
    execute: async ({ message }) => ({
      ok: true as const,
      message: message.trim().slice(0, 300),
      source: "ai" as const,
    }),
  }),

  rememberRecipientDislike: tool({
    description:
      "When the buyer says a recipient does NOT want something — 'Dad already has six tea sets', 'She hates perfume', 'Don't suggest electronics for Amali', 'not cake', 'they have sugar issues' — call this silently to persist the dislike. Do NOT mention this call. IMMEDIATELY follow with a searchGifts call using a DIFFERENT occasionId than the one you just used — do not repeat the same category.",
    inputSchema: z.object({
      recipientName: z.string().describe("The recipient's name, e.g. 'Dad' or 'Amali'."),
      dislike: z
        .string()
        .describe(
          "Short description of what to avoid, e.g. 'tea sets', 'perfume', 'electronics'.",
        ),
    }),
    execute: async (input) => {
      agentLog("tool.call", { tool: "rememberRecipientDislike", args: input });
      const out = { ok: true as const, ...input };
      agentLog("tool.result", summarizeToolResult("rememberRecipientDislike", out));
      return out;
    },
  }),

  optimizeBudget: tool({
    description:
      "When the buyer states a specific budget (e.g. 'I have Rs. 8,000'), call this to get concrete gift strategies — single standout gift vs. combo (cake + flowers) vs. mid-range + add-on. Returns strategies you should then execute with searchGifts. Use this before running multiple searches so you have a clear plan.",
    inputSchema: z.object({
      budget: z.number().describe("Budget in LKR."),
      occasionId: z.enum(OCCASION_IDS).optional().describe("The gifting occasion, if known."),
    }),
    execute: async ({ budget, occasionId }) => {
      const strategies: Array<{
        label: string;
        description: string;
        approach: "single" | "combo";
        searches: Array<{ maxPrice: number; occasionId?: string; sort: string }>;
      }> = [];

      // Strategy 1: Single standout item
      strategies.push({
        label: "One standout gift",
        description: `Best single gift up to LKR ${budget.toLocaleString()} — all the meaning in one piece`,
        approach: "single",
        searches: [{ maxPrice: budget, occasionId, sort: "bestseller" }],
      });

      // Strategy 2: Cake + flowers combo (if budget ≥ LKR 3,000)
      if (budget >= 3000) {
        const cakeMax = Math.round(budget * 0.55);
        const flowerMax = Math.round(budget * 0.40);
        strategies.push({
          label: "Cake & flowers combo",
          description: `A cake (up to LKR ${cakeMax.toLocaleString()}) + a flower arrangement (up to LKR ${flowerMax.toLocaleString()}) — two wow-moments in one delivery`,
          approach: "combo",
          searches: [
            { maxPrice: cakeMax, occasionId: "cakes", sort: "bestseller" },
            { maxPrice: flowerMax, occasionId: "flowers", sort: "bestseller" },
          ],
        });
      }

      // Strategy 3: Main gift + chocolate add-on (if budget ≥ LKR 4,500)
      if (budget >= 4500) {
        const mainMax = Math.round(budget * 0.72);
        const chocMax = Math.round(budget * 0.24);
        strategies.push({
          label: "Gift + chocolates",
          description: `A main gift (up to LKR ${mainMax.toLocaleString()}) + a box of chocolates (up to LKR ${chocMax.toLocaleString()}) — thoughtful and delicious`,
          approach: "combo",
          searches: [
            { maxPrice: mainMax, occasionId, sort: "bestseller" },
            { maxPrice: chocMax, occasionId: "chocolates", sort: "bestseller" },
          ],
        });
      }

      return { ok: true as const, budget, strategies };
    },
  }),

  searchYouTubeVideos: tool({
    description:
      "Search YouTube for relevant videos and show them inline in the chat. Only call this when the buyer seems genuinely uncertain about how a product looks or feels in real life, or when they want creative/DIY inspiration (e.g. handmade gift ideas, flower arrangement styles, unboxing a specific product type). Do NOT call for straightforward gift searches where the buyer is already confident. Good triggers: 'I'm not sure what it looks like', 'do you have something handmade?', 'what do these flower arrangements actually look like?', 'I want to make something myself', buyer hesitating after seeing product cards. Bad triggers: buyer browsing normally, any routine gift discovery.",
    inputSchema: z.object({
      query: z.string().describe("YouTube search query — be specific and descriptive, e.g. 'kapruka flower arrangement unboxing', 'handmade bouquet DIY tutorial', 'wooden photo frame gift ideas'."),
      contextNote: z.string().max(120).describe("One short sentence explaining why you're showing this — e.g. 'Here's how similar arrangements look on delivery' or 'Some inspiration for a handmade bouquet'. Shown above the video cards."),
      maxResults: z.number().int().min(1).max(4).optional().describe("Number of videos to show. Defaults to 3."),
    }),
    execute: async ({ query, contextNote, maxResults = 3 }) => {
      try {
        const res = await fetch(
          `${APP_URL}/api/youtube?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
        );
        const data = (await res.json()) as { ok?: boolean; videos?: unknown[]; error?: string };
        if (!data.ok) return { ok: false as const, error: data.error ?? "YouTube search failed." };
        return { ok: true as const, videos: data.videos ?? [], contextNote };
      } catch (err) {
        return errorPayload(err);
      }
    },
  }),

  visualizeProduct: tool({
    description:
      "When a customer describes a product they can't name in text ONLY (no photo attached), generate a product-style image to confirm you're on the right track before searching. Do NOT call this when the user already uploaded an image — look at their photo directly and call searchGifts instead.",
    inputSchema: z.object({
      description: z
        .string()
        .describe(
          "A concise visual and functional description of what the customer is looking for. E.g. 'a tall glass vase with dried tropical flowers inside'.",
        ),
      purpose: z
        .string()
        .optional()
        .describe("The gift's purpose or occasion, e.g. 'housewarming gift for a woman in her 40s'."),
    }),
    execute: async ({ description, purpose }) => {
      try {
        const res = await fetch(`${APP_URL}/api/generate-image`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ description, purpose }),
        });
        const data = (await res.json()) as { ok?: boolean; imageUrl?: string; error?: string };
        if (!data.ok || !data.imageUrl) {
          return { ok: false as const, error: data.error ?? "Image generation failed." };
        }
        return {
          ok: true as const,
          imageUrl: data.imageUrl,
          description,
        };
      } catch (err) {
        return errorPayload(err);
      }
    },
  }),
};

function makeSetPriceAlertTool(clientId?: string) {
  return tool({
    description:
      "When the buyer asks to be notified when a product's price drops below a target, call this to save a price alert. The UI will check daily and surface the alert when the price is hit.",
    inputSchema: z.object({
      productId: z.string().describe("The Kapruka product id."),
      productName: z.string().describe("The product name for display."),
      currentPrice: z.number().describe("The product's current price in LKR."),
      targetPrice: z
        .number()
        .describe("The price threshold in LKR — notify when price drops at or below this."),
    }),
    execute: async ({ productId, productName, currentPrice, targetPrice }) => {
      try {
        const res = await fetch(`${APP_URL}/api/price-alerts`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(clientId ? { "x-client-id": clientId } : {}),
          },
          body: JSON.stringify({
            productId,
            productName,
            currentPrice,
            targetPrice,
            clientId,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!data.ok) return { ok: false as const, error: data.error ?? "Failed to set alert." };
        return { ok: true as const, productName, targetPrice };
      } catch (err) {
        return errorPayload(err);
      }
    },
  });
}

export function createRukaTools(
  commerceContext?: CommerceContext | null,
  mode: AgentMode = "CHAT",
): ToolSet {
  const cartItems =
    commerceContext?.cart.map((c) => ({ id: c.id, name: c.name })) ?? [];

  if (mode === "TRACK") {
    return { trackOrder: rukaTools.trackOrder };
  }

  const { trackOrder: _track, ...chatTools } = rukaTools;
  void _track;

  return {
    ...chatTools,
    searchGifts: makeSearchGiftsTool(commerceContext?.giftFinderState),
    addToCart: makeAddToCartTool(commerceContext?.shownProducts),
    removeFromCart: makeRemoveFromCartTool(cartItems),
    setPriceAlert: makeSetPriceAlertTool(commerceContext?.clientId),
    ...(commerceContext?.giftFinderState && isGiftFinderComplete(commerceContext.giftFinderState)
      ? { refineGiftFinder: makeRefineGiftFinderTool(commerceContext.giftFinderState) }
      : {}),
  };
}

export type RukaTools = ToolSet;
