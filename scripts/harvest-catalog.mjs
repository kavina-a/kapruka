// ---------------------------------------------------------------------------
// Seed-catalog harvester.
//
// Kapruka's MCP free-text search is intermittently empty, but two things are
// rock-solid: (1) the public category landing pages embed schema.org Product
// JSON-LD (name + image + product id), and (2) kapruka_get_product returns full,
// accurate LKR data for any id. So we scrape ids from the category pages, then
// enrich each via get_product, producing lib/catalog/seed.json — a real catalog
// that powers the homepage rails and acts as a graceful fallback for the agent
// when live search returns nothing.
//
// Run: node scripts/harvest-catalog.mjs
// ---------------------------------------------------------------------------
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "lib", "catalog", "seed.json");
const MCP_URL = process.env.KAPRUKA_MCP_URL ?? "https://mcp.kapruka.com/mcp";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const OCCASIONS = [
  { id: "birthday", slug: "birthday" },
  { id: "anniversary", slug: "anniversary" },
  { id: "romance", slug: "lover" },
  { id: "wedding", slug: "wedding" },
  { id: "mother", slug: "mother" },
  { id: "newborn", slug: "baby" },
  { id: "sympathy", slug: "sympathies" },
  { id: "corporate", slug: "corporate" },
  { id: "cakes", slug: "cakes" },
  { id: "flowers", slug: "flowers" },
  { id: "chocolates", slug: "chocolates" },
  { id: "perfumes", slug: "perfumes" },
  { id: "fruit", slug: "fruitbaskets" },
  { id: "jewellery", slug: "jewellery" },
  { id: "toys", slug: "softtoy" },
];

const MAX_PER_OCCASION = 7;
const GLOBAL_CAP = 90;
const THROTTLE_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- MCP over raw Streamable HTTP --------------------------------------------
let sessionId = null;

function parseSse(text) {
  // Grab the JSON after the last "data:" line.
  const matches = [...text.matchAll(/^data:\s*(.+)$/gm)].map((m) => m[1]);
  if (!matches.length) throw new Error("No SSE data in response");
  return JSON.parse(matches[matches.length - 1]);
}

async function mcpInit() {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "ruka-harvester", version: "1.0.0" },
      },
    }),
  });
  sessionId = res.headers.get("mcp-session-id");
  await res.text();
  await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
}

async function mcpCall(name, params) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 1e6),
      method: "tools/call",
      params: { name, arguments: { params } },
    }),
  });
  const json = parseSse(await res.text());
  if (json.error) throw new Error(json.error.message ?? "MCP error");
  const result = json.result?.structuredContent?.result ?? json.result?.content?.[0]?.text;
  return result;
}

async function getProduct(id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await mcpCall("kapruka_get_product", {
        product_id: id,
        currency: "LKR",
        response_format: "json",
      });
      if (typeof text !== "string") throw new Error("bad response");
      if (/^Error/i.test(text.trim())) throw new Error(text.trim());
      return JSON.parse(text);
    } catch (err) {
      if (attempt === 2) {
        console.warn(`  ! get_product ${id} failed: ${err.message}`);
        return null;
      }
      await sleep(1500 * (attempt + 1));
    }
  }
  return null;
}

// --- Scrape ids from a category landing page ---------------------------------
async function scrapeCategory(slug) {
  const url = `https://www.kapruka.com/online/${slug}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
    if (!res.ok) {
      console.warn(`  ! fetch ${url} -> ${res.status}`);
      return [];
    }
    const html = await res.text();
    const re =
      /"@type":\s*"Product",\s*"name":\s*"((?:[^"\\]|\\.)*)",\s*"image":\s*"([^"]+)",\s*"url":\s*"[^"]*\/kid\/([^"]+)"/g;
    const ids = [];
    const seen = new Set();
    let m;
    while ((m = re.exec(html)) !== null) {
      const id = m[3].trim();
      if (id && !seen.has(id) && !/^catsym/i.test(id)) {
        seen.add(id);
        ids.push(id);
      }
      if (ids.length >= MAX_PER_OCCASION) break;
    }
    return ids;
  } catch (err) {
    console.warn(`  ! scrape ${slug} failed: ${err.message}`);
    return [];
  }
}

async function main() {
  console.log("Connecting to Kapruka MCP…");
  await mcpInit();
  console.log(`  session ${sessionId}`);

  // 1) Scrape candidate ids per occasion.
  const occasionIds = {};
  const allIds = [];
  const idOccasions = new Map();
  for (const occ of OCCASIONS) {
    const ids = await scrapeCategory(occ.slug);
    occasionIds[occ.id] = ids;
    console.log(`Scraped ${occ.id} (${occ.slug}): ${ids.length} ids`);
    for (const id of ids) {
      if (!idOccasions.has(id)) {
        idOccasions.set(id, new Set());
        allIds.push(id);
      }
      idOccasions.get(id).add(occ.id);
    }
  }

  const toEnrich = allIds.slice(0, GLOBAL_CAP);
  console.log(`\nEnriching ${toEnrich.length} unique products via get_product…`);

  // 2) Enrich each id via get_product (throttled).
  const products = [];
  const okIds = new Set();
  for (let i = 0; i < toEnrich.length; i++) {
    const id = toEnrich[i];
    const raw = await getProduct(id);
    if (raw && raw.id && raw.name) {
      raw.__occasions = [...idOccasions.get(id)];
      products.push(raw);
      okIds.add(id);
      process.stdout.write(`  [${i + 1}/${toEnrich.length}] ${raw.name.slice(0, 48)}\n`);
    }
    await sleep(THROTTLE_MS);
  }

  // 3) Rebuild occasion -> id map with only successfully-enriched ids.
  const occasionMap = {};
  for (const occ of OCCASIONS) {
    occasionMap[occ.id] = (occasionIds[occ.id] ?? []).filter((id) => okIds.has(id));
  }

  const out = {
    generatedAt: new Date().toISOString(),
    count: products.length,
    occasionMap,
    products,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${products.length} products to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
