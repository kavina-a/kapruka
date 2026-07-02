"""VALSEA speech services for Pipecat — Tamil / Sinhala STT and TTS.

Uses VALSEA's OpenAI-compatible audio endpoints:
  https://api.valsea.ai/v1/audio/transcriptions
  https://api.valsea.ai/v1/audio/speech
"""

from __future__ import annotations

import io
from collections.abc import AsyncGenerator

import aiohttp
from loguru import logger
from pipecat.frames.frames import ErrorFrame, Frame, TTSAudioRawFrame
from pipecat.services.openai.stt import OpenAISTTService
from pipecat.services.tts_service import TTSService
from pipecat.services.whisper.base_stt import Transcription
from pipecat.transcriptions.language import Language

VALSEA_BASE_URL = "https://api.valsea.ai/v1"

LANGUAGE_MAP: dict[Language, str] = {
    Language.TA: "tamil",
    Language.TA_IN: "tamil",
    Language.TA_LK: "tamil",
    Language.SI: "sinhala",
    Language.EN: "english",
}


class ValseaSTTService(OpenAISTTService):
    """REST STT via VALSEA — accent-aware Tamil, Sinhala, Singlish, etc."""

    def __init__(
        self,
        *,
        api_key: str,
        language: str = "tamil",
        **kwargs,
    ):
        super().__init__(
            api_key=api_key,
            base_url=VALSEA_BASE_URL,
            settings=OpenAISTTService.Settings(
                model="valsea-transcribe",
                language=Language.TA if language == "tamil" else Language.EN,
            ),
            **kwargs,
        )
        self._valsea_api_key = api_key
        self._valsea_language = language

    def language_to_service_language(self, language: Language) -> str | None:
        return LANGUAGE_MAP.get(language, self._valsea_language)

    async def _transcribe(self, audio: bytes) -> Transcription:
        lang = self._valsea_language
        if self._settings.language:
            mapped = self.language_to_service_language(self._settings.language)
            if mapped:
                lang = mapped

        form = aiohttp.FormData()
        form.add_field("file", audio, filename="audio.wav", content_type="audio/wav")
        form.add_field("model", "valsea-transcribe")
        form.add_field("language", lang)
        form.add_field("response_format", "verbose_json")
        form.add_field("enable_correction", "true")
        form.add_field("enable_tags", "true")

        headers = {"Authorization": f"Bearer {self._valsea_api_key}"}
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{VALSEA_BASE_URL}/audio/transcriptions",
                data=form,
                headers=headers,
            ) as resp:
                if resp.status != 200:
                    detail = await resp.text()
                    raise RuntimeError(f"VALSEA STT {resp.status}: {detail}")
                data = await resp.json()

        text = (data.get("clarified_text") or data.get("text") or "").strip()
        logger.debug(f"VALSEA STT [{lang}]: {text}")
        return Transcription(text=text)


class ValseaTTSService(TTSService):
    """TTS via VALSEA — supports Tamil and other Indian languages."""

    def __init__(
        self,
        *,
        api_key: str,
        language: str = "tamil",
        voice: str = "valsea-female",
        sample_rate: int = 24000,
        **kwargs,
    ):
        super().__init__(
            sample_rate=sample_rate,
            push_start_frame=True,
            push_stop_frames=True,
            **kwargs,
        )
        self._api_key = api_key
        self._language = language
        self._voice = voice

    async def run_tts(self, text: str, context_id: str) -> AsyncGenerator[Frame, None]:
        payload = {
            "model": "valsea-tts",
            "input": text,
            "voice": self._voice,
            "language": self._language,
            "response_format": "wav",
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{VALSEA_BASE_URL}/audio/speech",
                    json=payload,
                    headers=headers,
                ) as resp:
                    if resp.status != 200:
                        detail = await resp.text()
                        yield ErrorFrame(error=f"VALSEA TTS {resp.status}: {detail}")
                        return
                    audio_bytes = await resp.read()

            # Skip WAV header (44 bytes) for raw PCM if present
            pcm = audio_bytes
            if audio_bytes[:4] == b"RIFF" and len(audio_bytes) > 44:
                pcm = audio_bytes[44:]

            chunk_size = self.chunk_size
            for i in range(0, len(pcm), chunk_size):
                chunk = pcm[i : i + chunk_size]
                if chunk:
                    yield TTSAudioRawFrame(chunk, self.sample_rate, 1, context_id=context_id)
        except Exception as e:
            logger.exception("VALSEA TTS failed")
            yield ErrorFrame(error=str(e))
