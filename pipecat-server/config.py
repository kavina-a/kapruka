"""Environment configuration for the ChatRuka Pipecat server.

Two pipeline modes, each with swappable providers:

    REALTIME (default) — Gemini Live speech-to-speech
        • Multilingual: English, Sinhala, Tamil, Tanglish (leave GEMINI_LANGUAGE unset)
        • Optional pin: GEMINI_LANGUAGE=si-LK | ta-IN | en-US

    TRADITIONAL — STT → LLM → TTS
        • Best for English with Cartesia (high-quality, low-latency TTS)
        • STT: openai (Whisper) | deepgram
        • LLM: openai (GPT-4o) | google (Gemini)
        • TTS: cartesia | openai

Quick recipes (copy to .env and fill in API keys):

    # Realtime Gemini — multilingual voice (recommended)
    PIPECAT_PIPELINE_MODE=realtime
    GOOGLE_API_KEY=...
    GEMINI_MODEL=gemini-2.0-flash-live-001
    # GEMINI_LANGUAGE unset → auto language detection

    # Traditional — English with Cartesia TTS
    PIPECAT_PIPELINE_MODE=traditional
    OPENAI_API_KEY=...
    CARTESIA_API_KEY=...
    STT_PROVIDER=openai
    TTS_PROVIDER=cartesia
    CARTESIA_VOICE_ID=694f9389-aac1-45b6-b726-9d9369183238
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum

from dotenv import load_dotenv

load_dotenv(override=True)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class PipelineMode(str, Enum):
    REALTIME    = "realtime"     # Gemini Live speech-to-speech (default)
    TRADITIONAL = "traditional"  # STT + LLM + TTS


class STTProvider(str, Enum):
    OPENAI   = "openai"    # OpenAI Whisper — great for English
    DEEPGRAM = "deepgram"  # Deepgram nova-2 — very low latency


class LLMProvider(str, Enum):
    OPENAI = "openai"  # GPT-4o / GPT-4o-mini
    GOOGLE = "google"  # Gemini (text-mode, not Live)


class TTSProvider(str, Enum):
    CARTESIA = "cartesia"  # Best quality + lowest latency for English
    OPENAI   = "openai"    # OpenAI TTS (alloy, nova, etc.)


# ---------------------------------------------------------------------------
# Settings dataclass
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Settings:
    # ── Common ──────────────────────────────────────────────────────────────
    pipeline_mode: PipelineMode
    greet_first:   bool
    host:          str
    port:          int
    ruka_api_base:    str
    voice_api_token:  str | None

    # ── Realtime: Gemini Live ────────────────────────────────────────────────
    google_api_key:  str
    gemini_model:    str           # e.g. gemini-2.0-flash-live-001
    gemini_voice:    str           # e.g. Aoede, Charon, Fenrir, Kore, Puck
    gemini_language: str | None    # unset = multilingual auto-detect; or si-LK, ta-IN, en-US

    # ── Traditional: STT ────────────────────────────────────────────────────
    stt_provider:    STTProvider
    stt_model:       str           # whisper-1 | nova-2-general | etc.
    deepgram_api_key: str | None

    # ── Traditional: LLM ────────────────────────────────────────────────────
    llm_provider:    LLMProvider
    openai_api_key:  str
    llm_model:       str           # gpt-4o-mini | gpt-4o | gemini-1.5-flash

    # ── Traditional: TTS ────────────────────────────────────────────────────
    tts_provider:         TTSProvider
    cartesia_api_key:     str | None
    cartesia_model:       str       # sonic-2 | sonic-3
    cartesia_voice_id:    str       # Cartesia voice UUID
    openai_tts_voice:     str       # alloy | nova | echo | fable | onyx | shimmer


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------

def _enum(cls, raw: str | None, default):
    if not raw:
        return default
    try:
        return cls(raw.strip().lower())
    except ValueError:
        return default


def load_settings() -> Settings:
    return Settings(
        # Common
        pipeline_mode = _enum(PipelineMode, os.getenv("PIPECAT_PIPELINE_MODE"), PipelineMode.REALTIME),
        greet_first   = os.getenv("GREET_FIRST", "true").lower() in ("1", "true", "yes"),
        host          = os.getenv("PIPECAT_HOST", "0.0.0.0"),
        port          = int(os.getenv("PIPECAT_PORT", "7860")),
        ruka_api_base   = os.getenv("RUKA_API_BASE", "http://localhost:3000").rstrip("/"),
        voice_api_token = os.getenv("VOICE_API_TOKEN") or None,

        # Realtime — Gemini Live
        google_api_key  = os.getenv("GOOGLE_API_KEY", ""),
        gemini_model    = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-live-001"),
        gemini_voice    = os.getenv("GEMINI_VOICE", "Aoede"),
        gemini_language = os.getenv("GEMINI_LANGUAGE") or None,

        # Traditional — STT
        stt_provider     = _enum(STTProvider, os.getenv("STT_PROVIDER"), STTProvider.OPENAI),
        stt_model        = os.getenv("STT_MODEL", "whisper-1"),
        deepgram_api_key = os.getenv("DEEPGRAM_API_KEY") or None,

        # Traditional — LLM
        llm_provider = _enum(LLMProvider, os.getenv("LLM_PROVIDER"), LLMProvider.OPENAI),
        openai_api_key = os.getenv("OPENAI_API_KEY", ""),
        llm_model      = os.getenv("LLM_MODEL", os.getenv("OPENAI_MODEL", "gpt-4o-mini")),

        # Traditional — TTS
        tts_provider      = _enum(TTSProvider, os.getenv("TTS_PROVIDER"), TTSProvider.CARTESIA),
        cartesia_api_key  = os.getenv("CARTESIA_API_KEY") or None,
        cartesia_model    = os.getenv("CARTESIA_MODEL", "sonic-2"),
        cartesia_voice_id = os.getenv("CARTESIA_VOICE_ID", "694f9389-aac1-45b6-b726-9d9369183238"),
        openai_tts_voice  = os.getenv("OPENAI_TTS_VOICE", "nova"),
    )


settings = load_settings()
