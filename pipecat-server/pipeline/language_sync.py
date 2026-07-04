"""Keep conversation language and TTS voice aligned during a live call.

Listens to final user transcripts, updates :class:`LanguageSession`, and:
  * pushes an RTVI ``language`` server-message for UI/debug
  * for traditional pipelines, emits TTS settings updates and a system-language
    lock so STT → LLM → TTS stay on one language per turn
"""

from __future__ import annotations

from typing import Awaitable, Callable, Optional

from loguru import logger
from pipecat.frames.frames import (
    Frame,
    LLMMessagesAppendFrame,
    TranscriptionFrame,
    TTSUpdateSettingsFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.transcriptions.language import Language

from language import (
    LanguageSession,
    SpokenLanguage,
    parse_ui_lang,
    reply_language_instruction,
    tts_code,
    voice_for,
)

PushUI = Callable[[dict], Awaitable[None]]

# Map our spoken languages onto Pipecat Language enums where available.
_PIPECAT_LANGUAGE: dict[SpokenLanguage, Language] = {
    SpokenLanguage.ENGLISH: Language.EN_US,
    SpokenLanguage.TAMIL: Language.TA_IN,
    SpokenLanguage.TANGLISH: Language.EN_US,
    # Sinhala is not in Pipecat's Language enum; providers without `si` keep
    # the English tag — the LLM still replies in Sinhala via the persona lock.
    SpokenLanguage.SINHALA: Language.EN_US,
}


class LanguageSyncProcessor(FrameProcessor):
    """Synchronises detected caller language across the voice stack."""

    def __init__(
        self,
        session: LanguageSession,
        *,
        traditional: bool = False,
        push_ui: PushUI | None = None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._session = session
        self._traditional = traditional
        self._push_ui = push_ui

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame) and frame.text and frame.text.strip():
            await self._on_transcript(frame.text.strip())

        await self.push_frame(frame, direction)

    async def _on_transcript(self, text: str) -> None:
        changed = self._session.observe(text)
        if not changed:
            return

        lang = changed
        logger.info(
            f"Language switch → {lang.value} (switches={self._session.switch_count}) "
            f"text={text[:80]!r}"
        )

        # Traditional path: STT transcripts arrive before the LLM turn, so we
        # can lock reply language and retarget TTS for this response.
        # Realtime (Gemini Live) hears audio natively — persona + auto-detect
        # handle purity; we only emit UI telemetry here.
        if self._traditional:
            await self.push_frame(
                LLMMessagesAppendFrame(
                    messages=[
                        {
                            "role": "system",
                            "content": reply_language_instruction(lang),
                        }
                    ],
                    run_llm=False,
                )
            )
            pipecat_lang = _PIPECAT_LANGUAGE.get(lang, Language.EN_US)
            await self.push_frame(
                TTSUpdateSettingsFrame(
                    settings={
                        "language": pipecat_lang,
                        "voice": voice_for(lang, self._session.english_voice),
                    }
                )
            )

        if self._push_ui:
            await self._push_ui(
                {
                    "type": "language",
                    "language": lang.value,
                    "tts_language": tts_code(lang),
                    "voice": voice_for(lang, self._session.english_voice),
                }
            )


def session_from_runner_body(
    body: object,
    *,
    english_voice: str = "Aoede",
) -> LanguageSession:
    """Build a LanguageSession from SmallWebRTC ``requestData`` / runner body."""
    preferred: Optional[SpokenLanguage] = None
    if isinstance(body, dict):
        preferred = parse_ui_lang(body.get("lang") or body.get("language"))
    session = LanguageSession(preferred=preferred, english_voice=english_voice)
    logger.info(
        f"Language session bootstrap preferred="
        f"{preferred.value if preferred else None} voice={english_voice}"
    )
    return session
