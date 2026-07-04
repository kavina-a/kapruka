/**
 * ChatRuka prompt eval runner — uses the same model + system prompt as production.
 *
 * Usage:
 *   npm run eval:chat
 *   npm run eval:chat -- --scenario S9_chain_add_to_cart
 *   npm run eval:chat -- --category cart
 *   npm run eval:chat -- --verbose
 *
 * Model: Gemini with multi-key rotation (see lib/ai/gemini.ts).
 * Requires GEMINI_API_KEY_1 / GEMINI_API_KEY_2 / … in .env.
 */

import { config } from "dotenv";
// import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool, type CoreMessage, type UIMessage } from "ai";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { buildSystemPrompt } from "../lib/agent/persona";
import { buildCommerceContextBlock } from "../lib/agent/commerce-context";
import { inferModeFromHistory, resolveAgentMode } from "../lib/agent/modes";
import { OCCASIONS } from "../lib/catalog/occasions";
import { computeTurnFlags } from "../lib/agent/turn-flags";
import { GEMINI_CHAT_MODEL, isGeminiConfigured, withGeminiKeyFallback } from "../lib/ai/gemini";
import type { CommerceContext } from "../lib/commerce/types";
import { gradeResponse } from "./grade";
import { resolveTurns } from "./placeholders";
import { stubToolResponse } from "./stubs";
import type { Scenario, ScenarioResult, Turn } from "./types";

config({ path: path.join(process.cwd(), ".env") });
config({ path: path.join(process.cwd(), ".env.local"), override: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL = GEMINI_CHAT_MODEL;
const OCCASION_IDS = OCCASIONS.map((o) => o.id) as [string, ...string[]];

const args = process.argv.slice(2);
const filterScenario = args.find((a, i) => args[i - 1] === "--scenario");
const filterCategory = args.find((a, i) => args[i - 1] === "--category");
const verbose = args.includes("--verbose");

const scenarioBank: { scenarios: Scenario[] } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "scenarios.json"), "utf8"),
);

let scenarios = scenarioBank.scenarios;
if (filterScenario) scenarios = scenarios.filter((s) => s.id === filterScenario);
if (filterCategory) scenarios = scenarios.filter((s) => s.category === filterCategory);

function turnsToUIMessages(turns: Turn[]): UIMessage[] {
  return turns.map((t, i) => ({
    id: `turn-${i}`,
    role: t.role,
    parts: [{ type: "text" as const, text: t.content }],
  }));
}

function turnsToCoreMessages(turns: Turn[]): CoreMessage[] {
  return turns.map((t) => ({
    role: t.role,
    content: t.content,
  }));
}

function makeEvalTools(mode: "CHAT" | "TRACK") {
  const trackOrderTool = tool({
    description: "Track an existing order by order number",
    inputSchema: z.object({
      orderNumber: z.string(),
    }),
    execute: async (input) => stubToolResponse("trackOrder", input),
  });

  if (mode === "TRACK") {
    return { trackOrder: trackOrderTool };
  }

  return {
    showGiftFinder: tool({
      description:
        "Show the structured gift finder (relationship → personality → budget) when the buyer is stuck and has NO product preference. " +
        "Trigger signals: 'idk', 'I don't know', 'no idea', 'surprise me', 'you pick', 'you choose', 'whatever', 'no clue'. " +
        "Rules: (1) Do NOT call searchGifts in the same turn as this. (2) Do NOT call on the first user message. " +
        "(3) Only call ONCE — if you already called it this session and the buyer is still unsure, call searchGifts with a fresh occasionId instead. " +
        "Never search before they finish the picker chips.",
      inputSchema: z.object({}),
      execute: async () => stubToolResponse("showGiftFinder", {}),
    }),
    searchGifts: tool({
      description: "Search for gifts to show as product cards",
      inputSchema: z.object({
        occasionId: z.enum(OCCASION_IDS).optional(),
        query: z.string().optional(),
        minPrice: z.number().optional(),
        maxPrice: z.number().optional(),
        shopperNote: z.string().optional(),
        inStockOnly: z.boolean().optional(),
        alternativeQueries: z.array(z.string()).optional(),
      }),
      execute: async (input) => stubToolResponse("searchGifts", input),
    }),
    addToCart: tool({
      description: "Add a product to the cart when buyer explicitly confirms",
      inputSchema: z.object({
        productId: z.string().optional(),
        productName: z.string().optional(),
        quantity: z.number().int().min(1).max(99).optional(),
      }),
      execute: async (input) => stubToolResponse("addToCart", input),
    }),
    removeFromCart: tool({
      description: "Remove a product from the cart",
      inputSchema: z.object({
        productId: z.string().optional(),
        productName: z.string().optional(),
      }),
      execute: async (input) => stubToolResponse("removeFromCart", input),
    }),
    checkDelivery: tool({
      description: "Check delivery availability and fee for a city and date",
      inputSchema: z.object({
        city: z.string(),
        date: z.string().optional(),
        productId: z.string().optional(),
      }),
      execute: async (input) => stubToolResponse("checkDelivery", input),
    }),
    findDeliveryCities: tool({
      description: "Find and confirm a Sri Lankan delivery city",
      inputSchema: z.object({
        query: z.string(),
      }),
      execute: async (input) => stubToolResponse("findDeliveryCities", input),
    }),
    trackOrder: trackOrderTool,
    showCheckoutForm: tool({
      description: "Show the in-chat checkout form",
      inputSchema: z.object({
        step: z.enum(["review", "collect", "confirm", "payment"]),
      }),
      execute: async (input) => stubToolResponse("showCheckoutForm", input),
    }),
    updateCheckoutDetails: tool({
      description: "Parse and update checkout form fields from natural text",
      inputSchema: z.object({
        recipientName: z.string().optional(),
        recipientPhone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        date: z.string().optional(),
        senderName: z.string().optional(),
        giftMessage: z.string().optional(),
        deliveryNotes: z.string().optional(),
      }),
      execute: async (input) => stubToolResponse("updateCheckoutDetails", input),
    }),
    suggestGiftMessage: tool({
      description: "Write and auto-fill a gift message card",
      inputSchema: z.object({
        occasion: z.string().optional(),
        recipientName: z.string().optional(),
        senderName: z.string().optional(),
        tone: z.string().optional(),
      }),
      execute: async (input) => stubToolResponse("suggestGiftMessage", input),
    }),
    optimizeBudget: tool({
      description: "Turn a budget into a concrete gifting plan",
      inputSchema: z.object({
        budget: z.number(),
        occasion: z.string().optional(),
        recipient: z.string().optional(),
      }),
      execute: async (input) => stubToolResponse("optimizeBudget", input),
    }),
    updateBuyerProfile: tool({
      description: "Persist the buyer's name, city, or country",
      inputSchema: z.object({
        name: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional(),
      }),
      execute: async (input) => stubToolResponse("updateBuyerProfile", input),
    }),
    rememberRecipientDislike: tool({
      description: "Persist what a recipient does not want",
      inputSchema: z.object({
        recipientTag: z.string(),
        dislike: z.string(),
      }),
      execute: async (input) => stubToolResponse("rememberRecipientDislike", input),
    }),
    listOccasions: tool({
      description: "List all browsable occasions",
      inputSchema: z.object({}),
      execute: async () => stubToolResponse("listOccasions", {}),
    }),
    getGiftDetails: tool({
      description: "Get full details for a specific product",
      inputSchema: z.object({
        productId: z.string(),
      }),
      execute: async (input) => stubToolResponse("getGiftDetails", input),
    }),
    setPriceAlert: tool({
      description: "Set a price drop alert for a product",
      inputSchema: z.object({
        productId: z.string(),
        targetPrice: z.number().optional(),
      }),
      execute: async (input) => stubToolResponse("setPriceAlert", input),
    }),
  };
}

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const resolvedTurns = resolveTurns(scenario.turns);
  const uiMessages = turnsToUIMessages(resolvedTurns);
  const agentMode = resolveAgentMode(uiMessages);
  const previousMode = inferModeFromHistory(uiMessages.slice(0, -1));
  const switching =
    previousMode !== agentMode && resolvedTurns.at(-1)?.role === "user";

  // Mirrors app/api/chat/route.ts exactly (via the shared lib/agent/turn-flags
  // module) so the eval suite actually exercises the uncertainty/rejection
  // "force the model's hand" prompt injection — not just the base persona
  // prompt. This is what makes picker-triggering regressions catchable here.
  const commerceContext: CommerceContext | null = scenario.gift_finder_already_complete
    ? ({
        cart: [],
        subtotal: 0,
        delivery: {},
        sender: {},
        giftMessage: "",
        giftMessageSource: null,
        chatCheckoutStep: null,
        giftFinderState: {
          relationship: "father",
          occasionId: null,
          personalityTraits: ["practical"],
          budgetTier: null,
          exclusions: [],
        },
      } as CommerceContext)
    : null;
  const { uncertaintyBlock, rejectionBlock, giftFinderSubmitBlock } = computeTurnFlags(uiMessages, commerceContext);
  const commerceBlock = commerceContext ? `\n\n${buildCommerceContextBlock(commerceContext)}` : "";

  const system =
    buildSystemPrompt({}, agentMode, { switching, previousMode }) +
    commerceBlock +
    uncertaintyBlock +
    rejectionBlock +
    giftFinderSubmitBlock;
  const messages = turnsToCoreMessages(resolvedTurns);
  const tools = makeEvalTools(agentMode);

  const toolCallsMade: string[] = [];
  const toolInputs: Record<string, Record<string, unknown>> = {};

  const result = await withGeminiKeyFallback(MODEL, (model) =>
    generateText({
      model,
      system,
      messages,
      tools,
      stopWhen: stepCountIs(6),
      temperature: 0.7,
      onStepFinish: ({ toolCalls: calls }) => {
        for (const call of calls) {
          toolCallsMade.push(call.toolName);
          toolInputs[call.toolName] = call.input as Record<string, unknown>;
        }
      },
    }),
  );

  const finalText = result.text;
  const grades = gradeResponse(scenario, finalText, toolCallsMade, toolInputs);
  const pass = grades.every((g) => g.pass);

  return {
    id: scenario.id,
    name: scenario.name,
    category: scenario.category,
    pass,
    response: finalText,
    tool_calls: toolCallsMade,
    grades,
    notes: scenario.expect.notes ?? "",
  };
}

function printReport(results: ScenarioResult[]) {
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const score = total ? Math.round((passed / total) * 100) : 0;

  console.log("\n" + "═".repeat(60));
  console.log(`  CHATRUKA EVAL RESULTS  —  ${passed}/${total} passed  (${score}%)`);
  console.log(`  Model: ${MODEL}`);
  console.log("═".repeat(60));

  const categories = [...new Set(results.map((r) => r.category))];
  console.log("\nBy category:");
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPassed = catResults.filter((r) => r.pass).length;
    const bar = "█".repeat(catPassed) + "░".repeat(catResults.length - catPassed);
    console.log(`  ${cat.padEnd(18)} ${bar}  ${catPassed}/${catResults.length}`);
  }

  console.log("\nScenario details:");
  for (const r of results) {
    const icon = r.pass ? "✅" : "❌";
    console.log(`\n${icon}  ${r.id} — ${r.name}`);
    if (verbose || !r.pass) {
      for (const g of r.grades) {
        console.log(`     ${g.pass ? "✓" : "✗"}  ${g.detail}`);
      }
      if (!r.pass) {
        console.log(`\n     Tools called: ${r.tool_calls.join(", ") || "none"}`);
        console.log(`     Notes: ${r.notes}`);
        if (verbose) {
          console.log(
            `\n     Response:\n     ${r.response.slice(0, 500).replace(/\n/g, "\n     ")}`,
          );
        }
      }
    }
  }

  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.log("\n" + "─".repeat(60));
    console.log("  FAILURES TO FIX");
    console.log("─".repeat(60));
    for (const f of failures) {
      const failedChecks = f.grades
        .filter((g) => !g.pass)
        .map((g) => g.detail)
        .join("; ");
      console.log(`  ${f.id}: ${failedChecks}`);
    }
  }

  const reportPath = path.join(__dirname, "report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ score, passed, total, model: MODEL, results }, null, 2),
  );
  console.log(`\n  Full report → ${reportPath}\n`);
}

async function main() {
  if (!isGeminiConfigured()) {
    console.error("No Gemini API keys configured. Set GEMINI_API_KEY_1 (or GEMINI_API_KEY) in .env before running eval.");
    process.exit(1);
  }

  console.log(`\nRunning ${scenarios.length} scenario(s) against ${MODEL}...`);
  if (filterScenario) console.log(`  Filter: scenario = ${filterScenario}`);
  if (filterCategory) console.log(`  Filter: category = ${filterCategory}`);

  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    process.stdout.write(`  Running ${scenario.id}... `);
    try {
      const result = await runScenario(scenario);
      results.push(result);
      console.log(result.pass ? "PASS ✅" : "FAIL ❌");
    } catch (err) {
      console.log("ERROR 💥");
      results.push({
        id: scenario.id,
        name: scenario.name,
        category: scenario.category,
        pass: false,
        response: "",
        tool_calls: [],
        grades: [{ name: "runtime_error", pass: false, detail: String(err) }],
        notes: scenario.expect.notes ?? "",
      });
    }
  }

  printReport(results);
  const failed = results.some((r) => !r.pass);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
