import type { AgentMode } from "@/lib/agent/modes";
import { colomboToday, colomboTodayHuman, addDays, formatHumanDate } from "@/lib/commerce/dates";
import { OCCASIONS } from "@/lib/catalog/occasions";
import type { UserProfile } from "@/lib/commerce/store";
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
    .replaceAll("{{SAFE_DATE}}", formatHumanDate(addDays(today, 2)));
}

function modeRulesBlock(mode: AgentMode, switching: boolean): string {
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
  if (switching) {
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
  options?: { switching?: boolean },
): string {
  const base = mode === "TRACK" ? buildTrackSystemPrompt(profile) : buildChatSystemPrompt(profile);
  return `${modeRulesBlock(mode, options?.switching ?? false)}\n\n${base}`;
}
