import type { AgentMode } from "@/lib/agent/modes";
import { formatCalendarFactsBlock } from "@/lib/commerce/calendar";
import { colomboToday, colomboTodayHuman, addDays, formatHumanDate } from "@/lib/commerce/dates";
import { OCCASIONS } from "@/lib/catalog/occasions";
import type { UserProfile } from "@/lib/commerce/store";
import type { DetectedFlags } from "@/lib/agent/detect-flags";
import promptChatSpec from "@/docs/prompt-chat.json";

export const RUKA = {
  name: "ChatRuka",
  greeting: "Who are we gifting today?",
};

function agePersonaBlock(profile: UserProfile): string {
  const { ageGroup, age } = profile;

  // Derive ageGroup from numeric age if ageGroup isn't set yet
  const resolved =
    ageGroup ??
    (age !== undefined
      ? age < 22
        ? "teen"
        : age < 35
          ? "young-adult"
          : age < 55
            ? "adult"
            : "senior"
      : undefined);

  if (!resolved) {
    // No profile yet — instruct Ruka to identify buyer age early
    return `# Buyer demographics
You don't yet know the buyer's approximate age. Within the first 1-2 turns naturally ask — e.g. "Quick one — are you shopping for yourself or someone else, and roughly how old are you? Helps me pitch it right." Use judgement; if they've already given enough context (e.g. references to their kids, job, university) just infer it. Once you know, adjust your tone per the guidelines below.
- Under ~22 (teen / Gen Z): very casual, punchy, current slang okay ("lowkey", "no cap"), short sentences, lean on trending or fun gifts.
- 22–34 (young adult / millennial): upbeat but articulate, a little witty, balance trendy and tasteful.
- 35–54 (adult): warm and professional, complete sentences, lean classic or premium, avoid slang.
- 55+ (senior): respectful, unhurried, clear language, avoid abbreviations, lean traditional or heartfelt.`;
  }

  const toneMap: Record<string, string> = {
    teen: `The buyer is a teenager / Gen Z. Match their energy: very casual, punchy, short sentences. Slang is fine ("lowkey", "no cap"). Lean into fun, trending, or personalised gifts. Skip formal language entirely.`,
    "young-adult": `The buyer is a young adult (20s–early 30s). Be upbeat and a little witty. Balance trendy picks with good taste. Conversational but not childish. Shorter paragraphs, light humour.`,
    adult: `The buyer is a mature adult (mid-30s–50s). Warm, professional tone. Complete sentences. Steer toward classic, premium, or thoughtful gifts. Avoid slang or overly casual language.`,
    senior: `The buyer is 55+. Be respectful and unhurried. Clear, complete language — no abbreviations, no slang. Lean into traditional, heartfelt, or quality gifts. Err on the side of a little more explanation.`,
  };

  return `# Buyer demographics
${toneMap[resolved]}
${age !== undefined ? `Buyer's approximate age: ${age}.` : ""}`;
}

/**
 * Per-buyer context blocks injected into the system prompt at the
 * {{DYNAMIC_PROFILE_BLOCKS}} token. The prompt's voice and structure live in
 * docs/prompt-chat.json (the source of truth); these functions only supply the
 * runtime-personalised pieces that depend on the buyer's profile.
 */
const DIASPORA_COUNTRIES: Record<string, string> = {
  uk: "United Kingdom",
  "united kingdom": "United Kingdom",
  england: "United Kingdom",
  britain: "United Kingdom",
  australia: "Australia",
  aus: "Australia",
  canada: "Canada",
  usa: "United States",
  "united states": "United States",
  us: "United States",
  uae: "UAE",
  "united arab emirates": "UAE",
  dubai: "UAE",
  singapore: "Singapore",
  germany: "Germany",
  france: "France",
  italy: "Italy",
};

function diasporaBlock(profile: UserProfile): string {
  if (!profile.country) return "";
  const countryDisplay =
    DIASPORA_COUNTRIES[profile.country.toLowerCase()] ?? profile.country;
  return `\n# Diaspora context
The buyer is ordering from **${countryDisplay}** — they cannot be there in person for the delivery.
- Emphasise that Kapruka handles delivery across Sri Lanka and that they'll receive an order confirmation email with tracking.
- When discussing delivery dates, note Sri Lanka's Asia/Colombo timezone (IST +5:30) — e.g. "That would be Friday morning, Sri Lanka time."
- Proactively mention that Kapruka's tracked orders include delivery proof (photo/video) when available — a key concern for overseas senders.
- If they haven't mentioned a city, gently ask where the recipient is — don't assume Colombo for diaspora senders.
- Prices are always in LKR; if they ask for a currency equivalent, give a rough conversion note but clarify rates vary.`;
}

function buyerContextBlock(profile: UserProfile): string {
  const lines: string[] = [];

  if (profile.name) {
    lines.push(
      `- The buyer's name is **${profile.name}**. Use it once in your first reply if natural — then rarely. NEVER start mid-conversation messages with their name ('Got it, ${profile.name}—' reads robotic). Never use their name twice in one message.`,
    );
  } else {
    lines.push(
      `- You don't know the buyer's name yet. If they ask you "what's my name?" or "do you know my name?", be warm and honest: e.g. "Ha — I don't actually know your name yet! What should I call you?" When they tell you their name, call \`updateBuyerProfile\` immediately to save it, then naturally use their name in the reply.`,
    );
    lines.push(
      `- Within the first 1-2 turns, if it flows naturally, ask their name — e.g. "Before we dive in, what's your name?" Don't force it if the conversation is already moving fast.`,
    );
  }

  if (profile.city) {
    lines.push(
      `- Their default delivery city is **${profile.city}**. When they haven't specified a city, assume ${profile.city} and confirm before checking delivery fees.`,
    );
  }

  if (!lines.length) return "";
  return `\n# Buyer context\n${lines.join("\n")}`;
}

function fillPromptTokens(template: string, profile: UserProfile): string {
  const today = colomboToday();
  const occasionList = OCCASIONS.map((o) => `${o.id} (${o.label})`).join(", ");
  const dynamicProfileBlocks = `${agePersonaBlock(profile)}${buyerContextBlock(profile)}${diasporaBlock(profile)}`;

  return template
    .replaceAll("{{DYNAMIC_PROFILE_BLOCKS}}", dynamicProfileBlocks)
    .replaceAll("{{OCCASION_LIST}}", occasionList)
    .replaceAll("{{TODAY}}", today)
    .replaceAll("{{TODAY_HUMAN}}", colomboTodayHuman())
    .replaceAll("{{SAFE_DATE}}", formatHumanDate(addDays(today, 2)))
    .replaceAll("{{CALENDAR_FACTS}}", formatCalendarFactsBlock(today));
}

function modeRulesBlock(mode: AgentMode, switching: boolean, previousMode?: AgentMode): string {
  const spec = promptChatSpec as {
    agent_modes?: { shared_rules?: string[]; chat_rules?: string[]; track_rules?: string[] };
  };
  const shared = spec.agent_modes?.shared_rules ?? [];
  const specific =
    mode === "TRACK" ? spec.agent_modes?.track_rules ?? [] : spec.agent_modes?.chat_rules ?? [];

  const lines = [
    "# Agent mode (mandatory)",
    `You are running in **${mode}** mode for this turn.`,
    ...shared.map((r) => `- ${r}`),
    ...specific.map((r) => `- ${r}`),
  ];
  if (switching && mode === "TRACK" && previousMode === "CHAT") {
    lines.push(
      "- MODE SWITCH → TRACK (mandatory human handoff): You are now the tracking side of ChatRuka — same team, different focus. Your FIRST sentence after `[MODE: TRACK]` must feel like a real person taking over, not a system message. Briefly acknowledge what they asked about (delivery, order status, where is my package), then introduce yourself in plain language as the tracking side. Good: 'Ah — for where your order is, I'm on the tracking side. What's the order number from your confirmation email?' Good: 'Got you — delivery status is my lane. Share your Kapruka order number and I'll look it up.' Good: 'Hi — you were asking about that delivery. I'm the tracking side of ChatRuka; pop in your order number and I'll check.' Bad: 'Let's pull up your order.' Bad: 'Switching to track mode.' Bad: jumping straight to a question with no intro. Never say 'I am an AI agent' or 'mode switch'.",
    );
  } else if (switching && mode === "CHAT" && previousMode === "TRACK") {
    lines.push(
      "- MODE SWITCH → CHAT: Your FIRST line after `[MODE: CHAT]` must be one warm sentence summarising what you found on their order, then you're back to helping them shop or send something.",
    );
  } else if (switching) {
    lines.push(
      "- The buyer just switched mode — your FIRST line after the mode tag must be one sentence summarising what you resolved in the previous mode before continuing.",
    );
  }
  return lines.join("\n");
}

/** Gift concierge system prompt (CHAT mode). */
export function buildChatSystemPrompt(profile: UserProfile = {}): string {
  const template = (promptChatSpec.system_prompt as string[]).join("\n");
  return fillPromptTokens(template, profile);
}

/** Order tracking system prompt (TRACK mode). */
export function buildTrackSystemPrompt(profile: UserProfile = {}): string {
  const trackLines = (promptChatSpec as { track_system_prompt?: string[] }).track_system_prompt;
  const template = trackLines?.length
    ? trackLines.join("\n")
    : [
        "You are ChatRuka in TRACK mode — Kapruka order tracking only.",
        "Use trackOrder for status. Never invent status. Support: kapruka.com/contactUs",
      ].join("\n");
  return fillPromptTokens(template, profile);
}

export function buildSystemPrompt(
  profile: UserProfile = {},
  mode: AgentMode = "CHAT",
  options?: { switching?: boolean; previousMode?: AgentMode },
): string {
  const base = mode === "TRACK" ? buildTrackSystemPrompt(profile) : buildChatSystemPrompt(profile);
  return `${modeRulesBlock(mode, options?.switching ?? false, options?.previousMode)}\n\n${base}`;
}

/**
 * Builds a per-turn directive block from high-confidence client-side flags.
 * Injected at the very end of the system prompt — recency keeps it fresh in
 * the model's attention window. Returns empty string when no flags are set.
 *
 * @param userTurns - How many user messages exist so far this conversation.
 * The classifier re-evaluates every message independently with no memory, so
 * on turn 2+ a self_purchase label doesn't tell us whether this is a NEW
 * ambiguous request or the buyer's ANSWER to a clarifying question we already
 * asked (e.g. "spicy" → we ask "hot sauce or a snack?" → they reply "hot
 * sauce" → classifier says self_purchase again with no productSignal). Only
 * command "ask a question" on the buyer's first message; after that, defer to
 * the model reading its own prior turn from history instead of re-issuing the
 * same instruction and looping.
 */
export function buildSituationalDirective(
  flags: DetectedFlags | undefined,
  userTurns = 1,
): string {
  if (
    !flags ||
    (!flags.selfPurchase && !flags.searchNow && !flags.productSignal && !flags.unclearContext)
  ) {
    return "";
  }

  const lines: string[] = [
    "",
    "## THIS TURN — DIRECTIVE (highest priority, overrides all rules below)",
  ];

  if (flags.selfPurchase && flags.productSignal) {
    lines.push(
      `⚠️ SELF_PURCHASE + PRODUCT SIGNAL DETECTED`,
      `The buyer is making a **personal purchase** and wants **"${flags.productSignal}"**.`,
      `- NEVER ask "who is this for?" — it is for them.`,
      `- Call \`searchGifts\` immediately this turn — do NOT ask a clarifying question.`,
      `- YOU decide the best \`occasionId\` from Kapruka's catalogue. Do NOT use the product signal text directly as \`occasionId\` — pick the vertical that actually stocks this product.`,
      `- Example: "hot sauce" → NOT occasionId:'fruit' (that is the fruit-basket vertical). Think: does Kapruka have a condiments/grocery vertical? If not, admit the product may not be available rather than showing unrelated items.`,
      `- If search returns results with matchQuality:'related' that share zero attributes with what was asked — do not show them. Apply the catalogue mismatch rule.`,
    );
  } else if (flags.selfPurchase && userTurns <= 1) {
    lines.push(
      `The buyer is making a **personal purchase** (not a gift) — self_purchase detected.`,
      `- NEVER ask "who is this for?", "what's the occasion?", or assume a recipient.`,
      `- If a specific product type is clear, call \`searchGifts\` immediately with that occasionId.`,
      `- If the product they described is vague or doesn't map to a clear Kapruka category (e.g. "something spicy", "something sweet") — do NOT guess a category. Ask ONE short question about the PRODUCT itself, e.g. "Spicy how — a hot sauce, a chilli paste, or a spicy snack box?" Never guess "chocolates" as a fallback.`,
    );
  } else if (flags.selfPurchase) {
    lines.push(
      `The buyer is making a **personal purchase** (not a gift) — self_purchase detected, and this is NOT their first message this session.`,
      `- NEVER ask "who is this for?" or assume a recipient.`,
      `- Check your OWN previous message in the conversation history: if you already asked them what specific product they want, THIS message is very likely their answer — even a short one like "hot sauce" or "just a snack" IS the product. Call \`searchGifts\` immediately using their words as the query (occasionId only if it clearly maps to a Kapruka category — e.g. 'fruit' for a hamper/food vertical — otherwise omit occasionId and rely on query text). Do NOT ask the same clarifying question again — that creates a frustrating loop.`,
      `- Only ask another question if their reply is STILL genuinely vague ("idk", "anything", "you pick") — in that case treat it like Case B (see showGiftFinder rules) instead of repeating yourself.`,
    );
  } else if (flags.productSignal && flags.searchNow) {
    lines.push(
      `A clear product type was detected: **"${flags.productSignal}"**.`,
      `- Call \`searchGifts\` immediately — do NOT ask a clarifying question about what product they want.`,
      `- YOU decide the best \`occasionId\` from Kapruka's catalogue. Do NOT use the signal text directly as \`occasionId\` — pick the vertical that actually stocks this product.`,
      `- If no recipient is known, ask ONE warm lean-in after the cards appear.`,
    );
  } else if (flags.unclearContext) {
    lines.push(
      `This message has **no recipient, no occasion, no gift language, and no concrete product signal** — genuinely ambiguous (unclear_context detected).`,
      `- Do NOT call \`searchGifts\` — there is nothing real to search for yet, and guessing a category (e.g. defaulting to chocolates) is forbidden.`,
      `- Do NOT call \`showGiftFinder\` yet — that tool is for CONFIRMED gift intent with uncertainty, not for messages where gift intent itself is unconfirmed.`,
      `- Ask ONE short, warm question that clarifies what they want or who it's for — e.g. "Are you shopping for yourself or someone else?" Do not assume either way.`,
    );
  }

  return lines.join("\n");
}
