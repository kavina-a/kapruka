# ChatRuka Pipecat Server

Mini voice + calling pipeline for ChatRuka, modeled on the production `pipeline.py`
at the repo root (PipelineService, RTVI, transport abstraction, tool registry).

```
┌─────────────────┐     WebRTC      ┌──────────────────────┐
│  Next.js app    │ ◄──────────────►│  pipecat-server      │
│  (browser)      │   RTVI + audio  │  :7860               │
└────────┬────────┘                 └──────────┬───────────┘
         │                                     │
         │  /api/chat (text)                   │  Gemini Live (realtime)
         │                        MCP tools ──►│  or STT+LLM+TTS (traditional)
         └─ Kapruka MCP ◄─────────────────────┘
            (both channels connect directly)
```

## Why a separate Python service?

Pipecat runs a **long-lived audio/WebRTC pipeline** — it cannot live on Vercel
serverless. This folder is the deployable unit (Render, Fly, Cloud Run, or local).

Text chat stays in Next.js (`/api/chat`). Voice and phone calls use this server.
Both call **`/api/voice-tools`** so catalogue, delivery, and checkout logic never
diverge.

## Quick start

**Requires Python 3.11+.** `uv` will install it automatically if your system
Python is older (e.g. pyenv 3.10).

```bash
# One-time setup
cd pipecat-server
uv sync
cp .env.example .env   # set GOOGLE_API_KEY (and others for your pipeline mode)

# Terminal 1 — Next.js
npm run dev

# Terminal 2 — Pipecat (from repo root)
npm run pipecat:dev
```

Or run Pipecat directly:

```bash
cd pipecat-server
uv run bot.py
```

In the app, click **Call Ruka**. Default offer URL:
`http://localhost:7860/api/offer` (`NEXT_PUBLIC_VOICE_OFFER_URL`).

## Layout

| Path | Role |
|------|------|
| `bot.py` | Pipecat runner entry (`pipecat.runner.run.main`) |
| `config.py` | Env settings — all providers, all modes |
| `persona.py` | Voice system instruction |
| `pipeline/service.py` | **PipelineService** — builds pipeline, RTVI, lifecycle |
| `tools/mcp_tools.py` | MCP tool schemas → direct Kapruka MCP + RTVI UI push |

## Pipeline modes

| Mode | Set `PIPECAT_PIPELINE_MODE=` | Best for |
|------|-----|--------|
| **realtime** (default) | `realtime` | Sinhala, multilingual, multimodal — Gemini Live native audio |
| **traditional** | `traditional` | English — pick your own STT / LLM / TTS providers |

### Realtime — Gemini Live

```env
PIPECAT_PIPELINE_MODE=realtime
GOOGLE_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash-live-001   # default
GEMINI_VOICE=Aoede                        # Aoede | Charon | Fenrir | Kore | Puck
GEMINI_LANGUAGE=si-LK                     # Sinhala; omit for auto-detect
```

### Traditional — STT + LLM + TTS (English / Cartesia)

Each component is independently swappable:

| Layer | `_PROVIDER` var | Options |
|-------|----------------|---------|
| **STT** | `STT_PROVIDER` | `openai` (Whisper) · `deepgram` (nova-2) |
| **LLM** | `LLM_PROVIDER` | `openai` (GPT-4o) |
| **TTS** | `TTS_PROVIDER` | `cartesia` (sonic-2/3) · `openai` |

```env
PIPECAT_PIPELINE_MODE=traditional
OPENAI_API_KEY=...         # STT + LLM
CARTESIA_API_KEY=...
STT_PROVIDER=openai
STT_MODEL=whisper-1
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
TTS_PROVIDER=cartesia
CARTESIA_MODEL=sonic-2
CARTESIA_VOICE_ID=694f9389-aac1-45b6-b726-9d9369183238
```

See `.env.example` for all options with comments.

## RTVI → screen

Tool calls push `server-message` frames the React `VoiceBridge` applies:

- `products` — browse grid + carousel
- `add_to_cart` / `open_checkout`
- `show_checkout_form` — in-chat checkout steps
- `suggest_gift_message` — gift card draft
- `delivery_quote` / `track_order`

## Calling (telephony)

Browser calls use **SmallWebRTC** today. The Pipecat runner also supports
Twilio/Telnyx/Plivo WebSocket transports — point your SIP trunk webhook at this
same `bot()` entry and set `PIPECAT_PIPELINE_MODE=traditional` if you need
classic STT/TTS on phone lines.

## Security

Set `VOICE_API_TOKEN` here and in Next.js `.env.local`. The voice-tools route
checks `x-voice-token`.

## Relation to `voice/`

The older `voice/` folder is superseded by this package. Use `pipecat-server/`
going forward.
