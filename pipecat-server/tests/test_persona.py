"""Persona content contracts for multilingual voice quality."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from language import SpokenLanguage
from persona import build_system_instruction


def test_persona_requires_language_purity():
    prompt = build_system_instruction()
    assert "ONE language per reply" in prompt
    assert "Never mix" in prompt or "never mix" in prompt.lower()
    assert "Sinhala" in prompt
    assert "Tamil" in prompt
    assert "Tanglish" in prompt


def test_persona_includes_demographics():
    prompt = build_system_instruction()
    assert "Buyer demographics" in prompt
    assert "Gen Z" in prompt or "Teen" in prompt
    assert "Senior" in prompt


def test_persona_is_conversational_not_robotic():
    prompt = build_system_instruction()
    assert "How can I help you?" in prompt  # listed as forbidden
    assert "robotic" in prompt.lower() or "Never use robotic" in prompt
    assert "empathy" in prompt.lower() or "Empathy" in prompt


def test_persona_ui_preference_sinhala():
    prompt = build_system_instruction(preferred_language=SpokenLanguage.SINHALA)
    assert "UI preference: Sinhala" in prompt
    assert "Open the call in natural spoken Sinhala" in prompt


def test_persona_ui_preference_tamil():
    prompt = build_system_instruction(preferred_language=SpokenLanguage.TAMIL)
    assert "UI preference: Tamil" in prompt


def test_persona_ui_preference_english():
    prompt = build_system_instruction(preferred_language=SpokenLanguage.ENGLISH)
    assert "UI preference: English" in prompt


def test_persona_lists_show_gift_finder_and_end_call():
    prompt = build_system_instruction()
    assert "show_gift_finder" in prompt
    assert "end_call" in prompt
