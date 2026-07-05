"""PipelineService — builds and runs one voice session.

Supports three modes (set via PIPECAT_PIPELINE_MODE):

  realtime         — Gemini Live speech-to-speech (English / Sinhala / Tamil / Tanglish)
  openai_realtime  — OpenAI Realtime speech-to-speech (English, no separate STT/TTS)
  traditional      — STT → LLM → TTS with swappable providers per component

Traditional provider choices (all via .env):
  STT_PROVIDER : openai (Whisper) | deepgram
  LLM_PROVIDER : openai (GPT-4o)  | google (Gemini text)
  TTS_PROVIDER : elevenlabs       | cartesia | openai
"""

from __future__ import annotations

import uuid
from typing import Any, Optional, Tuple

from loguru import logger

from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.processors.frameworks.rtvi import RTVIServerMessageFrame
from pipecat.runner.types import RunnerArguments
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService
from pipecat.transports.base_transport import BaseTransport
from pipecat.workers.runner import WorkerRunner

from config import LLMProvider, PipelineMode, Settings, STTProvider, TTSProvider
from language import tts_code
from persona import build_system_instruction
from pipeline.language_sync import LanguageSyncProcessor, session_from_runner_body
from tools.mcp_tools import KaprukaMCPTools


class PipelineService:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._worker: PipelineWorker | None = None
        self._ruka: KaprukaMCPTools | None = None
        self._lang_session = session_from_runner_body(
            None,
            english_voice=self._active_voice(settings),
        )

    @staticmethod
    def _active_voice(settings: Settings) -> str:
        """Return the TTS voice name relevant to the current pipeline mode.

        Used to populate RTVI language-change events with a meaningful voice
        label rather than always emitting the Gemini voice string.
        """
        if settings.pipeline_mode == PipelineMode.OPENAI_REALTIME:
            return settings.openai_tts_voice
        return settings.gemini_voice

    # ------------------------------------------------------------------
    # Realtime pipeline — Gemini Live (speech-to-speech)
    # ------------------------------------------------------------------

    def _build_gemini_settings(self) -> GeminiLiveLLMService.Settings:
        """Build Gemini Live settings.

        Multilingual mode intentionally sets ``language=None``. Pipecat's
        default is ``en-US``, which pins English and breaks Sinhala/Tamil
        auto-detect. Native-audio models ignore language pins and choose the
        spoken language automatically; older live models also behave better
        with no pin.
        """
        s = self._settings
        preferred = self._lang_session.preferred
        kwargs: dict[str, Any] = dict(
            system_instruction=build_system_instruction(preferred_language=preferred),
            voice=s.gemini_voice,
            temperature=0.7,
            model=s.gemini_model,
        )

        if s.gemini_language:
            # Explicit env pin (whole-process lock) — only when operators set it.
            kwargs["language"] = s.gemini_language
            logger.info(f"Gemini language pinned via GEMINI_LANGUAGE={s.gemini_language}")
        else:
            # Critical: override Pipecat's en-US default so auto-detect works.
            kwargs["language"] = None
            logger.info("Gemini language=auto (no pin) — English / Sinhala / Tamil / Tanglish")

        return GeminiLiveLLMService.Settings(**kwargs)

    def _create_realtime_pipeline(
        self,
        transport: BaseTransport,
        ruka: KaprukaMCPTools,
    ) -> Tuple[Pipeline, tuple]:
        s = self._settings
        if not s.google_api_key:
            raise RuntimeError("GOOGLE_API_KEY is required for realtime (Gemini Live) pipeline.")

        logger.info(
            f"Realtime pipeline | model={s.gemini_model} voice={s.gemini_voice}"
            + (
                f" language={s.gemini_language}"
                if s.gemini_language
                else " language=multilingual (auto)"
            )
        )

        llm = GeminiLiveLLMService(
            api_key=s.google_api_key,
            settings=self._build_gemini_settings(),
            tools=ruka.schemas,
        )

        context = LLMContext()
        user_agg, assistant_agg = LLMContextAggregatorPair(
            context,
            realtime_service_mode=True,
        )

        # After LLM: observe transcripts for telemetry / UI language events.
        lang_sync = LanguageSyncProcessor(
            self._lang_session,
            traditional=False,
            push_ui=None,  # wired after worker exists
        )
        self._lang_sync = lang_sync

        pipeline = Pipeline([
            transport.input(),
            user_agg,
            llm,
            lang_sync,
            transport.output(),
            assistant_agg,
        ])
        return pipeline, (user_agg, assistant_agg)

    # ------------------------------------------------------------------
    # OpenAI Realtime pipeline — speech-to-speech (English)
    # ------------------------------------------------------------------

    def _create_openai_realtime_pipeline(
        self,
        transport: BaseTransport,
        ruka: KaprukaMCPTools,
    ) -> Tuple[Pipeline, tuple]:
        from pipecat.services.openai.realtime.llm import OpenAIRealtimeLLMService
        from pipecat.services.openai.realtime.events import (
            AudioConfiguration,
            AudioOutput,
            SessionProperties,
        )

        s = self._settings
        if not s.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required for openai_realtime pipeline.")

        preferred = self._lang_session.preferred
        instruction = build_system_instruction(preferred_language=preferred)

        logger.info(
            f"OpenAI Realtime pipeline | model={s.openai_realtime_model} voice={s.openai_tts_voice}"
        )

        session_props = SessionProperties(
            instructions=instruction,
            audio=AudioConfiguration(
                output=AudioOutput(voice=s.openai_tts_voice),
            ),
        )

        llm = OpenAIRealtimeLLMService(
            api_key=s.openai_api_key,
            model=s.openai_realtime_model,
            session_properties=session_props,
        )

        # Register tool handlers — same as traditional OpenAI path.
        ruka.register_on_llm(llm)

        context = LLMContext()
        # Declare tool schemas so the model knows what functions it can call.
        context.set_tools(ruka.schemas)

        user_agg, assistant_agg = LLMContextAggregatorPair(
            context,
            realtime_service_mode=True,
        )

        lang_sync = LanguageSyncProcessor(
            self._lang_session,
            traditional=False,
            push_ui=None,
        )
        self._lang_sync = lang_sync

        pipeline = Pipeline([
            transport.input(),
            user_agg,
            llm,
            lang_sync,
            transport.output(),
            assistant_agg,
        ])
        return pipeline, (user_agg, assistant_agg)

    # ------------------------------------------------------------------
    # Traditional pipeline — STT + LLM + TTS
    # ------------------------------------------------------------------

    def _build_stt(self):
        s = self._settings
        if s.stt_provider == STTProvider.DEEPGRAM:
            if not s.deepgram_api_key:
                raise RuntimeError("DEEPGRAM_API_KEY is required when STT_PROVIDER=deepgram.")
            from pipecat.services.deepgram.stt import DeepgramSTTService
            logger.info(f"STT | deepgram model={s.stt_model}")
            return DeepgramSTTService(
                api_key=s.deepgram_api_key,
                settings=DeepgramSTTService.Settings(model=s.stt_model),
            )
        else:
            # openai (Whisper) — omit language so Whisper auto-detects
            if not s.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is required when STT_PROVIDER=openai.")
            from pipecat.services.openai.stt import OpenAISTTService
            model = s.stt_model if s.stt_model != "nova-2-general" else "whisper-1"
            logger.info(f"STT | openai model={model} language=auto")
            return OpenAISTTService(api_key=s.openai_api_key, model=model)

    def _build_llm(self, ruka: KaprukaMCPTools):
        s = self._settings
        preferred = self._lang_session.preferred
        instruction = build_system_instruction(preferred_language=preferred)

        if s.llm_provider == LLMProvider.GOOGLE:
            if not s.google_api_key:
                raise RuntimeError("GOOGLE_API_KEY is required when LLM_PROVIDER=google.")
            from pipecat.services.google.llm import GoogleLLMService
            logger.info(f"LLM | google model={s.llm_model}")
            logger.warning(
                "LLM_PROVIDER=google in traditional mode has limited tool support. "
                "Consider using LLM_PROVIDER=openai for full tool calling, "
                "or PIPECAT_PIPELINE_MODE=realtime for Gemini Live with full tools."
            )
            llm = GoogleLLMService(
                api_key=s.google_api_key,
                settings=GoogleLLMService.Settings(model=s.llm_model),
                system_instruction=instruction,
            )
            return llm
        else:
            if not s.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is required when LLM_PROVIDER=openai.")
            from pipecat.services.openai.llm import OpenAILLMService
            logger.info(f"LLM | openai model={s.llm_model}")
            llm = OpenAILLMService(
                api_key=s.openai_api_key,
                model=s.llm_model,
            )
            ruka.register_on_llm(llm)
            return llm

    def _initial_tts_language(self) -> str:
        """TTS language tag aligned with session bootstrap language."""
        lang = self._lang_session.bootstrap()
        # English profile always speaks English.
        if self._settings.voice_profile.value == "english":
            return "en"
        return tts_code(lang)

    def _build_tts(self):
        s = self._settings
        tts_lang = self._initial_tts_language()

        if s.tts_provider == TTSProvider.ELEVENLABS:
            if not s.elevenlabs_api_key:
                raise RuntimeError("ELEVENLABS_API_KEY is required when TTS_PROVIDER=elevenlabs.")
            from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
            logger.info(
                f"TTS | elevenlabs model={s.elevenlabs_model} "
                f"voice={s.elevenlabs_voice_id} language={tts_lang}"
            )
            return ElevenLabsTTSService(
                api_key=s.elevenlabs_api_key,
                settings=ElevenLabsTTSService.Settings(
                    voice=s.elevenlabs_voice_id,
                    model=s.elevenlabs_model,
                    language=tts_lang,
                ),
            )
        elif s.tts_provider == TTSProvider.CARTESIA:
            if not s.cartesia_api_key:
                raise RuntimeError("CARTESIA_API_KEY is required when TTS_PROVIDER=cartesia.")
            from pipecat.services.cartesia.tts import CartesiaTTSService
            logger.info(
                f"TTS | cartesia model={s.cartesia_model} voice={s.cartesia_voice_id}"
            )
            return CartesiaTTSService(
                api_key=s.cartesia_api_key,
                settings=CartesiaTTSService.Settings(
                    model=s.cartesia_model,
                    voice=s.cartesia_voice_id,
                ),
            )
        else:
            if not s.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is required when TTS_PROVIDER=openai.")
            from pipecat.services.openai.tts import OpenAITTSService
            logger.info(f"TTS | openai voice={s.openai_tts_voice}")
            return OpenAITTSService(
                api_key=s.openai_api_key,
                settings=OpenAITTSService.Settings(voice=s.openai_tts_voice),
            )

    def _create_traditional_pipeline(
        self,
        transport: BaseTransport,
        ruka: KaprukaMCPTools,
    ) -> Tuple[Pipeline, tuple]:
        s = self._settings
        preferred = self._lang_session.preferred
        instruction = build_system_instruction(preferred_language=preferred)

        logger.info(
            f"Traditional pipeline | stt={s.stt_provider.value}"
            f" llm={s.llm_provider.value}/{s.llm_model}"
            f" tts={s.tts_provider.value}"
            f" bootstrap_lang={self._lang_session.bootstrap().value}"
        )

        stt = self._build_stt()
        llm = self._build_llm(ruka)
        tts = self._build_tts()

        lang_sync = LanguageSyncProcessor(
            self._lang_session,
            traditional=True,
            push_ui=None,
        )
        self._lang_sync = lang_sync

        context = LLMContext(
            messages=[{"role": "system", "content": instruction}],
        )
        # Declare tools in the context so OpenAI includes them in every API call.
        # register_on_llm() wires the Python handlers; set_tools() declares the
        # schemas — both are required for tool calling to work.
        context.set_tools(ruka.schemas)
        user_agg, assistant_agg = LLMContextAggregatorPair(context)

        pipeline = Pipeline([
            transport.input(),
            stt,
            lang_sync,
            user_agg,
            llm,
            tts,
            transport.output(),
            assistant_agg,
        ])
        return pipeline, (user_agg, assistant_agg)

    # ------------------------------------------------------------------
    # Session lifecycle
    # ------------------------------------------------------------------

    async def initialize(
        self,
        transport: BaseTransport,
        runner_args: RunnerArguments,
    ) -> PipelineWorker:
        conversation_id = f"ruka-{uuid.uuid4().hex[:12]}"

        # Session prefs from browser (UI language, etc.) via offer requestData.
        # Use the voice name that matches the active pipeline so that all RTVI
        # language-change events carry a meaningful voice label for the client.
        self._lang_session = session_from_runner_body(
            getattr(runner_args, "body", None),
            english_voice=self._active_voice(self._settings),
        )

        logger.info(
            f"Starting session {conversation_id} | mode={self._settings.pipeline_mode.value}"
            f" profile={self._settings.voice_profile.value}"
            f" preferred_lang="
            f"{self._lang_session.preferred.value if self._lang_session.preferred else None}"
        )

        self._ruka = KaprukaMCPTools()
        self._lang_sync: Optional[LanguageSyncProcessor] = None

        if self._settings.pipeline_mode == PipelineMode.TRADITIONAL:
            pipeline, _ = self._create_traditional_pipeline(transport, self._ruka)
        elif self._settings.pipeline_mode == PipelineMode.OPENAI_REALTIME:
            pipeline, _ = self._create_openai_realtime_pipeline(transport, self._ruka)
        else:
            pipeline, _ = self._create_realtime_pipeline(transport, self._ruka)

        self._worker = PipelineWorker(
            pipeline,
            params=PipelineParams(
                enable_metrics=True,
                enable_usage_metrics=True,
            ),
            enable_rtvi=True,
            conversation_id=conversation_id,
            idle_timeout_secs=runner_args.pipeline_idle_timeout_secs,
        )

        async def push_ui(data: dict) -> None:
            if self._worker:
                await self._worker.queue_frames([RTVIServerMessageFrame(data=data)])

        self._ruka.set_push_ui(push_ui)
        if self._lang_sync is not None:
            self._lang_sync._push_ui = push_ui

        @transport.event_handler("on_client_connected")
        async def on_client_connected(transport_local, client):  # noqa: ANN001
            logger.info("Client connected")
            # Tell the browser which language/voice the session starts with.
            bootstrap = self._lang_session.bootstrap()
            await push_ui(
                {
                    "type": "language",
                    "language": bootstrap.value,
                    "tts_language": (
                        "en"
                        if self._settings.voice_profile.value == "english"
                        else tts_code(bootstrap)
                    ),
                    "voice": self._active_voice(self._settings),
                    "source": "bootstrap",
                }
            )
            if self._settings.greet_first and self._worker:
                await self._worker.queue_frames([LLMRunFrame()])

        @transport.event_handler("on_client_disconnected")
        async def on_client_disconnected(transport_local, client):  # noqa: ANN001
            logger.info("Client disconnected")
            if self._worker:
                await self._worker.cancel()

        return self._worker

    async def run(self, transport: BaseTransport, runner_args: RunnerArguments) -> None:
        worker = await self.initialize(transport, runner_args)
        runner = WorkerRunner(handle_sigint=runner_args.handle_sigint)
        await runner.add_workers(worker)
        await runner.run()
