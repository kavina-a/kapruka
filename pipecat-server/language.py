"""Spoken-language detection and session language state for the voice pipeline.

Keeps STT / LLM / TTS aligned by classifying caller transcripts and mapping
them to Gemini / provider language codes and voice identities.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class SpokenLanguage(str, Enum):
    ENGLISH = "en"
    SINHALA = "si"
    TAMIL = "ta"
    TANGLISH = "tanglish"


# Gemini Live / BCP-47 codes. Native-audio models auto-detect and ignore pins;
# we still expose codes for traditional STT/TTS and optional session pins.
GEMINI_LANGUAGE_CODES: dict[SpokenLanguage, str] = {
    SpokenLanguage.ENGLISH: "en-US",
    SpokenLanguage.SINHALA: "si-LK",
    SpokenLanguage.TAMIL: "ta-IN",
    SpokenLanguage.TANGLISH: "en-US",  # Latin-script Sinhala; model follows prompt
}

# UI lang (en/si/ta) → spoken language preference (soft hint only).
UI_LANG_MAP: dict[str, SpokenLanguage] = {
    "en": SpokenLanguage.ENGLISH,
    "si": SpokenLanguage.SINHALA,
    "ta": SpokenLanguage.TAMIL,
}

# Single consistent English voice; Sinhala/Tamil use the same character so the
# caller's experience stays one persona while speech language switches.
DEFAULT_VOICE_BY_LANGUAGE: dict[SpokenLanguage, str] = {
    SpokenLanguage.ENGLISH: "Aoede",
    SpokenLanguage.SINHALA: "Aoede",
    SpokenLanguage.TAMIL: "Aoede",
    SpokenLanguage.TANGLISH: "Aoede",
}

# ElevenLabs / OpenAI-style language tags for traditional TTS.
TTS_LANGUAGE_CODES: dict[SpokenLanguage, str] = {
    SpokenLanguage.ENGLISH: "en",
    SpokenLanguage.SINHALA: "si",
    SpokenLanguage.TAMIL: "ta",
    SpokenLanguage.TANGLISH: "en",
}

_TAMIL_RE = re.compile(r"[\u0B80-\u0BFF]")
_SINHALA_RE = re.compile(r"[\u0D80-\u0DFF]")

# High-signal Tanglish / colloquial Sinhala in Latin script (Sri Lankan callers).
_TANGLISH_MARKERS = re.compile(
    r"\b("
    r"amma|thaththa|aiya|akka|nangi|malli|putha|duwa|"
    r"eka|ekak|ekata|ekakata|ekakda|"
    r"ganna|gannawa|gannaona|karanna|karanawa|karan|"
    r"ona|nadda|neda|hodai|honda|hari|"
    r"kohomada|mokadda|mokada|monawada|danne|"
    r"gift\s*ekak|order\s*eka|cart\s*eka|budget\s*eka|"
    r"upandi|suba\s*upadina|kapruka"
    r")\b",
    re.IGNORECASE,
)

# Common Tamil romanisation markers (Tanglish-Tamil / spoken Tamil in Latin).
_TAMIL_LATIN_MARKERS = re.compile(
    r"\b("
    r"amma|appa|anna|akka|thambi|thangai|"
    r"venum|venuma|iruku|irukku|sollu|enna|"
    r"romba|super|seri|sari|illa|illai|"
    r"gift\s*venum|order\s*number"
    r")\b",
    re.IGNORECASE,
)

# Pure English gift phrases — used only to avoid false Tanglish positives.
_ENGLISH_ONLY_HINTS = re.compile(
    r"\b(birthday|anniversary|flowers?|chocolate|perfume|delivery|checkout|track)\b",
    re.IGNORECASE,
)


def detect_spoken_language(text: str) -> Optional[SpokenLanguage]:
    """Classify a transcript turn. Returns None when the text is empty/unclear."""
    if not text or not text.strip():
        return None

    sample = text.strip()

    if _TAMIL_RE.search(sample):
        return SpokenLanguage.TAMIL
    if _SINHALA_RE.search(sample):
        return SpokenLanguage.SINHALA

    # Latin-script: prefer Tanglish when markers dominate; Tamil-latin next.
    tanglish_hits = len(_TANGLISH_MARKERS.findall(sample))
    tamil_latin_hits = len(_TAMIL_LATIN_MARKERS.findall(sample))
    words = max(1, len(sample.split()))

    if tamil_latin_hits >= 2 or (tamil_latin_hits >= 1 and words <= 6):
        # Overlap with Sinhala kinship terms (amma/akka) — Tanglish wins if
        # Sinhala particles are present.
        if tanglish_hits >= tamil_latin_hits and _TANGLISH_MARKERS.search(sample):
            return SpokenLanguage.TANGLISH
        if tamil_latin_hits > tanglish_hits:
            return SpokenLanguage.TAMIL

    if tanglish_hits >= 1:
        return SpokenLanguage.TANGLISH

    # Default Latin script without Lankan markers → English.
    if re.search(r"[A-Za-z]", sample):
        return SpokenLanguage.ENGLISH

    return None


def parse_ui_lang(raw: object) -> Optional[SpokenLanguage]:
    """Map UI chrome language (en/si/ta) to a spoken-language preference."""
    if not isinstance(raw, str):
        return None
    return UI_LANG_MAP.get(raw.strip().lower())


def gemini_code(lang: SpokenLanguage) -> str:
    return GEMINI_LANGUAGE_CODES[lang]


def tts_code(lang: SpokenLanguage) -> str:
    return TTS_LANGUAGE_CODES[lang]


def voice_for(lang: SpokenLanguage, english_voice: str = "Aoede") -> str:
    """Return the TTS voice identity for a language.

    English always uses ``english_voice`` (single consistent English voice).
    Sinhala/Tamil use the same persona voice so mid-call switches change
    language, not character.
    """
    if lang == SpokenLanguage.ENGLISH or lang == SpokenLanguage.TANGLISH:
        return english_voice
    return DEFAULT_VOICE_BY_LANGUAGE.get(lang, english_voice)


def language_label(lang: SpokenLanguage) -> str:
    return {
        SpokenLanguage.ENGLISH: "English",
        SpokenLanguage.SINHALA: "Sinhala",
        SpokenLanguage.TAMIL: "Tamil",
        SpokenLanguage.TANGLISH: "Tanglish (Sinhala in Latin script)",
    }[lang]


def reply_language_instruction(lang: SpokenLanguage) -> str:
    """Hard instruction injected when the active session language changes."""
    label = language_label(lang)
    if lang == SpokenLanguage.ENGLISH:
        return (
            f"SESSION LANGUAGE LOCK: The caller is speaking {label}. "
            "Reply ONLY in English for this turn and all following turns until they switch. "
            "Do not mix in Sinhala or Tamil words. Keep product names and city names in English."
        )
    if lang == SpokenLanguage.TANGLISH:
        return (
            "SESSION LANGUAGE LOCK: The caller is speaking Tanglish (Sinhala in Latin script). "
            "Reply ONLY in Tanglish — Sinhala words in Latin script with natural English structure. "
            "Do not switch to pure English or Sinhala script unless they do first. "
            "Keep product names and city names in English."
        )
    if lang == SpokenLanguage.SINHALA:
        return (
            "SESSION LANGUAGE LOCK: The caller is speaking Sinhala (සිංහල). "
            "Reply ONLY in Sinhala script. Do not mix English sentences. "
            "Keep product names, city names, and prices in English."
        )
    return (
        "SESSION LANGUAGE LOCK: The caller is speaking Tamil (தமிழ்). "
        "Reply ONLY in Tamil script. Do not mix English sentences. "
        "Keep product names, city names, and prices in English."
    )


@dataclass
class LanguageSession:
    """Tracks the active spoken language for one call."""

    active: Optional[SpokenLanguage] = None
    preferred: Optional[SpokenLanguage] = None  # UI hint before first speech
    english_voice: str = "Aoede"
    switch_count: int = 0

    def bootstrap(self) -> SpokenLanguage:
        """Language to use before the caller has spoken (greeting)."""
        return self.preferred or SpokenLanguage.ENGLISH

    def observe(self, text: str) -> Optional[SpokenLanguage]:
        """Update active language from a user transcript.

        Returns the new language when it changes, else None.
        """
        detected = detect_spoken_language(text)
        if detected is None:
            return None

        # Tanglish and Sinhala share the Sinhala conversation track for voice
        # identity; we still distinguish them for reply style.
        if self.active == detected:
            return None

        # Avoid flapping on a single ambiguous English token while in Tanglish.
        if (
            self.active in (SpokenLanguage.TANGLISH, SpokenLanguage.SINHALA)
            and detected == SpokenLanguage.ENGLISH
            and len(text.split()) < 4
            and not _ENGLISH_ONLY_HINTS.search(text)
        ):
            return None

        self.active = detected
        self.switch_count += 1
        return detected

    @property
    def current(self) -> SpokenLanguage:
        return self.active or self.bootstrap()
