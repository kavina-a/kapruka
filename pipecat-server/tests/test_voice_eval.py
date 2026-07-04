"""Repeatable conversation-quality checks against the voice persona.

Uses a text LLM to simulate the voice agent (same system instruction as
Gemini Live). Requires OPENAI_API_KEY. Skipped when the key is absent so
unit tests stay offline-friendly.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from language import SpokenLanguage, detect_spoken_language
from persona import build_system_instruction

OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")
pytestmark = pytest.mark.skipif(not OPENAI_KEY, reason="OPENAI_API_KEY not set")

_TAMIL_RE = re.compile(r"[\u0B80-\u0BFF]")
_SINHALA_RE = re.compile(r"[\u0D80-\u0DFF]")


def _chat(messages: list[dict], *, preferred: SpokenLanguage | None = None) -> str:
    from openai import OpenAI

    client = OpenAI(api_key=OPENAI_KEY)
    system = build_system_instruction(preferred_language=preferred)
    # Voice has no tools in this eval — instruct the model to speak as if tools
    # would run, without inventing product catalogues.
    system += (
        "\n\n# Eval mode\n"
        "Tools are not available in this simulation. Do not invent specific product "
        "names or prices. Ask at most one clarifying question, stay in character, "
        "and keep replies to 1–2 spoken sentences."
    )
    resp = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=0.4,
        messages=[{"role": "system", "content": system}, *messages],
    )
    return (resp.choices[0].message.content or "").strip()


def _is_mostly_english(text: str) -> bool:
    if _TAMIL_RE.search(text) or _SINHALA_RE.search(text):
        return False
    letters = re.findall(r"[A-Za-z]", text)
    return len(letters) >= max(8, len(text) // 4)


def _has_sinhala(text: str) -> bool:
    return bool(_SINHALA_RE.search(text))


def _has_tamil(text: str) -> bool:
    return bool(_TAMIL_RE.search(text))


def _no_robotic_filler(text: str) -> bool:
    banned = [
        "how can i help you",
        "i'd be happy to assist",
        "certainly!",
        "great choice!",
    ]
    low = text.lower()
    return not any(b in low for b in banned)


SCENARIOS = [
    {
        "id": "en_gift",
        "preferred": SpokenLanguage.ENGLISH,
        "turns": [
            {"role": "user", "content": "Hi, I need a birthday gift for my mum in Kandy."},
        ],
        "assert": "english",
    },
    {
        "id": "si_script",
        "preferred": SpokenLanguage.SINHALA,
        "turns": [
            {"role": "user", "content": "හායි, අම්මට උපන්දින තෑග්ගක් ඕනේ"},
        ],
        "assert": "sinhala",
    },
    {
        "id": "ta_script",
        "preferred": SpokenLanguage.TAMIL,
        "turns": [
            {"role": "user", "content": "வணக்கம், அம்மாவுக்கு பிறந்தநாள் பரிசு வேண்டும்"},
        ],
        "assert": "tamil",
    },
    {
        "id": "tanglish",
        "preferred": SpokenLanguage.ENGLISH,
        "turns": [
            {"role": "user", "content": "ammata gift ekak ganna ona, birthday eka"},
        ],
        "assert": "tanglish_or_sinhala",
    },
    {
        "id": "mid_call_switch_en_to_tanglish",
        "preferred": SpokenLanguage.ENGLISH,
        "turns": [
            {"role": "user", "content": "I want flowers for an anniversary."},
            # Assistant turn filled at runtime
            {"role": "user", "content": "budget eka around five thousand, Kandy delivery"},
        ],
        "assert": "tanglish_or_sinhala",
        "multi": True,
    },
    {
        "id": "senior_tone",
        "preferred": SpokenLanguage.ENGLISH,
        "turns": [
            {
                "role": "user",
                "content": (
                    "Good afternoon. I am seventy-two and would like to send a simple, "
                    "traditional gift to my sister in Colombo for her birthday. "
                    "I am not very good with websites."
                ),
            },
        ],
        "assert": "english_senior",
    },
    {
        "id": "gen_z_tone",
        "preferred": SpokenLanguage.ENGLISH,
        "turns": [
            {
                "role": "user",
                "content": "yo need something lowkey cute for my girlfriend's birthday, not boring",
            },
        ],
        "assert": "english_casual",
    },
]


def _check(assert_kind: str, reply: str) -> None:
    assert reply, "empty reply"
    assert _no_robotic_filler(reply), f"robotic filler in: {reply}"
    assert len(reply.split()) < 80, f"reply too long for voice: {reply}"

    if assert_kind == "english":
        assert _is_mostly_english(reply), f"expected English, got: {reply}"
        assert not _has_sinhala(reply) and not _has_tamil(reply)
    elif assert_kind == "sinhala":
        assert _has_sinhala(reply), f"expected Sinhala script, got: {reply}"
    elif assert_kind == "tamil":
        assert _has_tamil(reply), f"expected Tamil script, got: {reply}"
    elif assert_kind == "tanglish_or_sinhala":
        # Tanglish (Latin) or Sinhala script — not pure formal English essay.
        is_tanglish = detect_spoken_language(reply) in (
            SpokenLanguage.TANGLISH,
            SpokenLanguage.SINHALA,
        ) or any(
            m in reply.lower()
            for m in ("eka", "onna", "ganna", "hodai", "amma", "budget")
        )
        assert is_tanglish or _has_sinhala(reply), f"expected Tanglish/Sinhala, got: {reply}"
    elif assert_kind == "english_senior":
        assert _is_mostly_english(reply)
        # Should not be full of slang.
        assert "no cap" not in reply.lower()
        assert "lowkey" not in reply.lower()
    elif assert_kind == "english_casual":
        assert _is_mostly_english(reply)
    else:
        raise AssertionError(f"unknown assert kind {assert_kind}")


@pytest.mark.parametrize("scenario", SCENARIOS, ids=[s["id"] for s in SCENARIOS])
def test_voice_conversation_scenario(scenario: dict):
    preferred = scenario["preferred"]
    turns = list(scenario["turns"])

    if scenario.get("multi"):
        # Run first user turn, capture assistant, then second user turn.
        first = [{"role": "user", "content": turns[0]["content"]}]
        reply1 = _chat(first, preferred=preferred)
        _check("english", reply1)
        messages = [
            {"role": "user", "content": turns[0]["content"]},
            {"role": "assistant", "content": reply1},
            {"role": "user", "content": turns[1]["content"]},
        ]
        reply2 = _chat(messages, preferred=preferred)
        _check(scenario["assert"], reply2)
        return

    reply = _chat(turns, preferred=preferred)
    _check(scenario["assert"], reply)
