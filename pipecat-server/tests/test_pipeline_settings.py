"""Pipeline settings contracts — language must not pin English by default."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import PipelineMode, Settings, STTProvider, LLMProvider, TTSProvider, VoiceProfile
from language import SpokenLanguage
from pipeline.language_sync import session_from_runner_body
from pipeline.service import PipelineService


def _settings(**overrides) -> Settings:
    base = dict(
        pipeline_mode=PipelineMode.REALTIME,
        voice_profile=VoiceProfile.MULTILINGUAL,
        greet_first=True,
        host="0.0.0.0",
        port=7860,
        ruka_api_base="http://localhost:3000",
        voice_api_token=None,
        google_api_key="test-key",
        gemini_model="gemini-2.5-flash-native-audio-preview-12-2025",
        gemini_voice="Aoede",
        gemini_language=None,
        stt_provider=STTProvider.OPENAI,
        stt_model="whisper-1",
        deepgram_api_key=None,
        llm_provider=LLMProvider.OPENAI,
        openai_api_key="",
        llm_model="gpt-4o-mini",
        tts_provider=TTSProvider.ELEVENLABS,
        cartesia_api_key=None,
        cartesia_model="sonic-2",
        cartesia_voice_id="x",
        openai_tts_voice="nova",
        elevenlabs_api_key=None,
        elevenlabs_voice_id="x",
        elevenlabs_model="eleven_turbo_v2_5",
    )
    base.update(overrides)
    return Settings(**base)


def test_gemini_settings_do_not_pin_english_when_unset():
    svc = PipelineService(_settings())
    gemini = svc._build_gemini_settings()
    # language=None overrides Pipecat's en-US default so auto-detect works.
    assert gemini.language is None
    assert gemini.voice == "Aoede"


def test_gemini_settings_honour_explicit_pin():
    svc = PipelineService(_settings(gemini_language="ta-IN"))
    gemini = svc._build_gemini_settings()
    assert gemini.language == "ta-IN"


def test_gemini_settings_include_ui_language_preference():
    svc = PipelineService(_settings())
    svc._lang_session = session_from_runner_body({"lang": "si"}, english_voice="Aoede")
    gemini = svc._build_gemini_settings()
    assert "UI preference: Sinhala" in gemini.system_instruction


def test_session_from_runner_body_reads_lang():
    session = session_from_runner_body({"lang": "ta"}, english_voice="Aoede")
    assert session.preferred == SpokenLanguage.TAMIL
    assert session.bootstrap() == SpokenLanguage.TAMIL


def test_english_voice_default_is_aoede():
    svc = PipelineService(_settings())
    assert svc._settings.gemini_voice == "Aoede"
