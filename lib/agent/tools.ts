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

export const rukaTools = {
  searchGifts: tool({
    description:
      "Find gifts to show the customer as image cards. `query` = the PRODUCT only (e.g. 'batman toy', 'red roses') — never recipient names like 'brother' or 'mum'. Put recipient/occasion in shopperNote.\n\n" +
      "CATEGORY ANCHORING (critical for search quality):\n" +
      "- Specific flower types (tulip, sunflower, orchid, carnation, gerbera, daisy, peony, lily, lavender, freesia, etc.) → always set `occasionId: 'flowers'`. Without it, the search engine returns completely unrelated products.\n" +
      "- Specific cake types (chocolate cake, ribbon cake, cheesecake, red velvet, etc.) → set `occasionId: 'cakes'`.\n" +
      "- Specific chocolate types (dark chocolate, pistachio chocolate, Ferrero, Toblerone, etc.) → set `occasionId: 'chocolates'`.\n" +
      "- Specific perfume types (Dior, CK, floral perfume, etc.) → set `occasionId: 'perfumes'`.\n\n" +
      "ALTERNATIVES: If exact variety may be missing (e.g. tulips, lilies not in catalogue), pass alternativeQueries with 2-3 similar varieties + the broader category. When matchQuality is 'related': show max 3 cards, use a POSITIVE shopperNote (e.g. 'Tulips are rare here — these fresh picks will land just as beautifully') — never 'nothing matched'. After cards, ask ONE human question: who is it for, what colour they like, or soft vs bold vibe.\n\n" +
      "POST-CART: After addToCart, run the post-cart moment BEFORE checkout — offer one complement (chocolates, card via suggestGiftMessage) in one casual sentence. Never 'Shall we proceed to checkout?'",
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
      try {
        const res = await searchGifts({ ...input, limit: 8 });
        const isSubstitution = res.matchQuality === "related";
        const productLimit = isSubstitution ? 3 : 8;
        const note = shopperNote?.trim() || res.note;
        return {
          ok: true as const,
          source: res.source,
          occasion: res.occasion,
          note,
          matchQuality: res.matchQuality,
          searchedFor: res.searchedFor,
          count: Math.min(res.products.length, productLimit),
          products: res.products.slice(0, productLimit),
        };
      } catch (err) {
        return errorPayload(err);
      }
    },
  }),

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
      "Check real delivery availability, the flat LKR delivery fee, and any perishable warning for a city + date. Always do this before promising delivery. City must be an exact Kapruka zone (e.g. 'Colombo 03', not 'Colombo') — run findDeliveryCities first if unsure.",
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
      orderNumber: z.string().describe("Kapruka order number, e.g. 'VIMP34456CB2'."),
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
      "When the buyer says a recipient does NOT want something — 'Dad already has six tea sets', 'She hates perfume', 'Don't suggest electronics for Amali' — call this silently to persist that dislike to the recipient's profile. The UI will ensure future recommendations avoid it. Do NOT mention this call.",
    inputSchema: z.object({
      recipientName: z.string().describe("The recipient's name, e.g. 'Dad' or 'Amali'."),
      dislike: z
        .string()
        .describe(
          "Short description of what to avoid, e.g. 'tea sets', 'perfume', 'electronics'.",
        ),
    }),
    execute: async (input) => ({ ok: true as const, ...input }),
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

  setPriceAlert: tool({
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
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ productId, productName, currentPrice, targetPrice }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!data.ok) return { ok: false as const, error: data.error ?? "Failed to set alert." };
        return { ok: true as const, productName, targetPrice };
      } catch (err) {
        return errorPayload(err);
      }
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
    addToCart: makeAddToCartTool(commerceContext?.shownProducts),
    removeFromCart: makeRemoveFromCartTool(cartItems),
  };
}

export type RukaTools = ToolSet;
