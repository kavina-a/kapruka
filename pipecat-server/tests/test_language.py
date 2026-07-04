"""Unit tests for spoken-language detection and session tracking."""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `uv run pytest` from pipecat-server/ without installing the package.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from language import (
    LanguageSession,
    SpokenLanguage,
    detect_spoken_language,
    parse_ui_lang,
    reply_language_instruction,
    voice_for,
)


def test_detect_english():
    assert detect_spoken_language("I need a birthday gift for my mum") == SpokenLanguage.ENGLISH


def test_detect_sinhala_script():
    assert detect_spoken_language("මට මල් මිලදී ගන්න ඕන") == SpokenLanguage.SINHALA


def test_detect_tamil_script():
    assert detect_spoken_language("எனக்கு பூக்கள் வேண்டும்") == SpokenLanguage.TAMIL


def test_detect_tanglish():
    assert detect_spoken_language("ammata gift ekak ganna ona") == SpokenLanguage.TANGLISH
    assert detect_spoken_language("order eka track karan") == SpokenLanguage.TANGLISH


def test_detect_empty():
    assert detect_spoken_language("") is None
    assert detect_spoken_language("   ") is None


def test_parse_ui_lang():
    assert parse_ui_lang("en") == SpokenLanguage.ENGLISH
    assert parse_ui_lang("si") == SpokenLanguage.SINHALA
    assert parse_ui_lang("ta") == SpokenLanguage.TAMIL
    assert parse_ui_lang("fr") is None


def test_english_voice_is_consistent():
    assert voice_for(SpokenLanguage.ENGLISH, "Aoede") == "Aoede"
    assert voice_for(SpokenLanguage.SINHALA, "Aoede") == "Aoede"
    assert voice_for(SpokenLanguage.TAMIL, "Aoede") == "Aoede"


def test_session_bootstrap_uses_ui_preference():
    session = LanguageSession(preferred=SpokenLanguage.TAMIL, english_voice="Aoede")
    assert session.bootstrap() == SpokenLanguage.TAMIL
    assert session.current == SpokenLanguage.TAMIL


def test_session_switches_on_transcript():
    session = LanguageSession(preferred=SpokenLanguage.ENGLISH)
    # First observation sets active from None → ENGLISH.
    assert session.observe("I need a gift") == SpokenLanguage.ENGLISH
    assert session.observe("ammata gift ekak ganna ona") == SpokenLanguage.TANGLISH
    assert session.active == SpokenLanguage.TANGLISH
    assert session.observe("எனக்கு பூக்கள் வேண்டும்") == SpokenLanguage.TAMIL
    assert session.switch_count == 3


def test_session_avoids_english_flap_in_tanglish():
    session = LanguageSession()
    session.observe("ammata gift ekak ganna ona")
    assert session.active == SpokenLanguage.TANGLISH
    # Short ambiguous English should not flap back.
    assert session.observe("okay") is None
    assert session.active == SpokenLanguage.TANGLISH
    # Clear English gift intent should switch.
    assert session.observe("Actually let's do this in English — birthday flowers please") == SpokenLanguage.ENGLISH


def test_reply_language_instruction_is_monolingual():
    en = reply_language_instruction(SpokenLanguage.ENGLISH)
    assert "ONLY in English" in en
    assert "Do not mix" in en

    si = reply_language_instruction(SpokenLanguage.SINHALA)
    assert "Sinhala" in si
    assert "ONLY" in si

    ta = reply_language_instruction(SpokenLanguage.TAMIL)
    assert "Tamil" in ta
