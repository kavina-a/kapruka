# ChatRuka — Kapruka Gift Concierge

> A full-screen conversational shopping agent for the **Kapruka Agent Challenge**, built on the live [`mcp.kapruka.com`](https://mcp.kapruka.com/) Model Context Protocol server. Ruka discovers real gifts, quotes real delivery across Sri Lanka, and closes the loop with a **real Kapruka guest-checkout pay link** and order tracking.

Ruka is the spirit of the _Kapruka_ — Sri Lanka's mythical wish-granting tree (the කප්රුක / _kalpavruksha_). It's framed as a **gift concierge**, not a generic store, because the Kapruka order model is built around gifting: recipient, sender, occasion, gift message, and cake icing text.

---

## What it does

- **Conversational discovery** — chat with Ruka, who has taste and an opinion. It asks at most one question, then shows image cards and narrows to a confident recommendation.
- **Dual-zone UI** — a full-screen chat thread on the left, a persistent, independently-scrollable browse grid on the right. Both read/write the same cart + active-set store, so add-to-cart behaves identically everywhere.
- **Rich product surfaces** — inline carousels in chat (3–8 cards, per the OpenAI Apps SDK guidance), a fullscreen product detail overlay with a real image gallery, variants, stock, and cake-icing input.
- **Multi-item cart** — quantity edits, removal, running subtotal, per-cake icing message, persisted across reloads.
- **Real, deterministic checkout** — a verifiable state machine: re-validate stock/price → capture delivery (with **live city autocomplete** and a **real delivery-fee quote**) → confirm-before-charge → `create_order` → **real Kapruka pay link** → confirmation.
- **Order tracking** — look up any Kapruka order number for a live status timeline.
- **Language** — Ruka mirrors English, **Sinhala, Tamil, or Tanglish**.
- **Real-time voice ("Call Ruka")** — a full speech-to-speech mode powered by **Pipecat + Google Gemini Live**. Talk to Ruka in English, Sinhala, Tamil, or Tanglish; language auto-detects and switches mid-call with one consistent voice. Product cards, cart, and checkout render on screen. See [`pipecat-server/`](pipecat-server/README.md).

## Why it's built this way (headline decisions)

1. **Checkout is real, not mocked.** `kapruka_create_order` returns a live `checkout_url` + `order_ref` + a 60-minute price lock. Ruka frames the purchase; Kapruka's hosted page takes the card. No Stripe, no PCI scope — the trusted rail executes.
2. **Checkout is deterministic UI, not LLM-driven.** The model does discovery and persuasion and can _initiate_ checkout, but delivery capture, validation, the confirm-before-charge checkpoint, and the `create_order` call are plain React/server code. The agent can never bluff about money, stock, or delivery.
3. **The model never sees raw MCP.** A server layer cleans noisy summaries, adds resilient search, emits clean typed data for rich UI, and caches against the shared per-IP rate limit.
4. **Live search is treated as unreliable, by design.** The Kapruka free-text search is intermittently empty (see [`research/mcp-findings.md`](research/mcp-findings.md)). So discovery is anchored on curated occasions and backed by a **verified seed catalogue** (90 real products harvested via the rock-solid `get_product`). The experience never dead-ends.
5. **Voice reuses one brain, not a second one.** The Pipecat voice bot doesn't re-implement the catalogue or hit the MCP directly — its tools call back into the Next.js `/api/voice-tools` endpoint, which uses the _same_ resilient search, seed fallback, and delivery logic as text. The bot pushes structured data to the browser over RTVI server-messages, so voice renders the same product cards / cart / checkout. (Pipecat is Python and holds a long-lived WebRTC pipeline, so it runs as a **separate service** — the Next.js app stays on Vercel; the voice service runs anywhere that allows long-lived connections.)

Full write-up in [`docs/architecture.md`](docs/architecture.md).

---

## Tech stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS v4**
- **Vercel AI SDK** (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`) — streaming + tool-calling, model set by `OPENAI_MODEL`
- **`@modelcontextprotocol/sdk`** — Streamable HTTP client to `mcp.kapruka.com`
- **Zustand** — UI-agnostic cart + checkout state
- **Motion** (Framer Motion) for animation, **lucide-react** icons, **Zod** schemas
- **Voice:** **Pipecat** (Python) + **Google Gemini Live** (speech-to-speech, multilingual) on the server; **`@pipecat-ai/client-react`** + **SmallWebRTC** on the client

## Getting started

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env.local
#    then set OPENAI_API_KEY (and optionally OPENAI_MODEL)

# 3. Run
npm run dev
# open http://localhost:3000
```

### Environment variables

| Variable                       | Required | Default                       | Notes                                          |
| ------------------------------ | -------- | ----------------------------- | ---------------------------------------------- |
| `OPENAI_API_KEY`               | Yes      | —                             | Powers Ruka's brain (tool-calling).            |
| `OPENAI_MODEL`                 | No       | `gpt-4.1`                     | Any OpenAI model with tool calling.            |
| `KAPRUKA_MCP_URL`              | No       | `https://mcp.kapruka.com/mcp` | The MCP endpoint.                              |
| `NEXT_PUBLIC_DEFAULT_CURRENCY` | No       | `LKR`                         | Display currency (app is LKR-first).           |
| `NEXT_PUBLIC_VOICE_OFFER_URL`  | No       | `http://localhost:7860/api/offer` | Voice service WebRTC endpoint (browser-side).  |
| `VOICE_API_TOKEN`              | No       | —                             | Optional shared secret guarding `/api/voice-tools`. |

> Without `OPENAI_API_KEY`, the UI still loads and the catalogue/checkout flow works; the chat returns a friendly "not connected" message.

### Voice mode ("Call Ruka") — optional

The real-time voice agent is a small **Python** service in [`voice/`](voice/README.md) that
runs alongside the Next.js app. It needs a **Google Gemini API key** ([AI Studio](https://aistudio.google.com/apikey)).

```bash
# Terminal 1 — the web app (above)
npm run dev

# Terminal 2 — the voice service
cd voice
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # set GOOGLE_API_KEY=...
python bot.py               # serves WebRTC at http://localhost:7860/api/offer
```

Then click **Call Ruka** in the app and allow the microphone. Full details in [`voice/README.md`](voice/README.md).

## Project layout

```
app/
  api/chat/route.ts        # Streaming chat endpoint (Vercel AI SDK + tools)
  api/voice-tools/route.ts # Internal tool API the voice bot calls (shared catalogue logic)
  actions.ts               # Server actions for deterministic checkout/tracking
  page.tsx                 # Server component → seeds featured catalogue
lib/
  mcp/                     # client (transport+cache), normalize, kapruka service
  commerce/                # types, Zustand store, date helpers
  catalog/                 # occasions, seed loader, seed.json (harvested)
  agent/                   # Ruka persona + server tools
  voice/                   # Pipecat client, server-message protocol, RTVI bridge
components/                 # landing, app shell, chat, products, cart, checkout, track, voice, ui
voice/                      # Python Pipecat + Gemini Live service (separate process)
  bot.py persona.py ruka_tools.py  # pipeline, voice persona, FunctionSchema tools
scripts/harvest-catalog.mjs  # Rebuilds the verified seed catalogue
docs/ research/            # architecture + research notes
```

## Rebuilding the seed catalogue

The seed catalogue (`lib/catalog/seed.json`) is harvested from Kapruka's public category pages and enriched via `get_product`:

```bash
node scripts/harvest-catalog.mjs
```

## Deploy (Vercel)

```bash
vercel            # link + deploy a preview
vercel --prod     # production
```

Set `OPENAI_API_KEY` (and any overrides) in the Vercel project's Environment Variables. The chat route runs on the Node.js runtime (the MCP SDK is server-only).

The **voice service** can't run on Vercel (it holds a long-lived WebRTC/audio pipeline). Deploy `voice/` to any host that allows long-lived connections (Render, Fly.io, Railway, Cloud Run), set `GOOGLE_API_KEY` + `RUKA_API_BASE` (your deployed app URL) there, and point the app's `NEXT_PUBLIC_VOICE_OFFER_URL` at `https://<voice-host>/api/offer`.

## Scope (explicit)

Guest checkout only (the MCP has no login); payment completes on Kapruka's hosted page by design; the post-payment order number is emailed by Kapruka, so tracking is manual entry; the catalogue is live MCP data with brittle search mitigated by the seed fallback; caching is in-memory (serverless cold starts reset it). Voice handles discovery, persuasion, add-to-cart, and opening checkout; the actual delivery capture + payment runs through the same deterministic on-screen checkout (the voice model never touches the money path).
