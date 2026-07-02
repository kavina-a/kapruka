"""PipelineService — builds and runs one voice session.

Supports two modes (set via PIPECAT_PIPELINE_MODE):

  realtime    — Gemini Live speech-to-speech (English / Sinhala / Tamil / Tanglish)
  traditional — STT → LLM → TTS with swappable providers per component

Traditional provider choices (all via .env):
  STT_PROVIDER : openai (Whisper) | deepgram
  LLM_PROVIDER : openai (GPT-4o)  | google (Gemini text)
  TTS_PROVIDER : cartesia          | openai
"""

from __future__ import annotations

import uuid
from typing import Any, Tuple

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
from persona import build_system_instruction
from tools.mcp_tools import KaprukaMCPTools


class PipelineService:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._worker: PipelineWorker | None = None
        self._ruka: KaprukaMCPTools | None = None

    # ------------------------------------------------------------------
    # Realtime pipeline — Gemini Live (speech-to-speech)
    # ------------------------------------------------------------------

    def _build_gemini_settings(self) -> GeminiLiveLLMService.Settings:
        s = self._settings
        kwargs: dict[str, Any] = dict(
            system_instruction=build_system_instruction(),
            voice=s.gemini_voice,
            temperature=0.7,
            model=s.gemini_model,
        )
        # Only pin when GEMINI_LANGUAGE is set. Unset = Gemini multilingual auto-detect
        # (English, Sinhala, Tamil, Tanglish) — do not default to si-LK or en-US here.
        if s.gemini_language:
            kwargs["language"] = s.gemini_language
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

        pipeline = Pipeline([
            transport.input(),
            user_agg,
            llm,
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
            # openai (Whisper)
            if not s.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is required when STT_PROVIDER=openai.")
            from pipecat.services.openai.stt import OpenAISTTService
            model = s.stt_model if s.stt_model != "nova-2-general" else "whisper-1"
            logger.info(f"STT | openai model={model}")
            return OpenAISTTService(api_key=s.openai_api_key, model=model)

    def _build_llm(self, ruka: KaprukaMCPTools):
        s = self._settings
        if s.llm_provider == LLMProvider.GOOGLE:
            # GoogleLLMService (text mode) uses a different tool API from OpenAI.
            # Function schemas must be passed at construction time; register_function
            # is not available. For full tool support in traditional mode use openai.
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
                system_instruction=build_system_instruction(),
            )
            return llm
        else:
            # openai (default) — full function-calling support
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

    def _build_tts(self):
        s = self._settings
        if s.tts_provider == TTSProvider.CARTESIA:
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
            # openai
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
        logger.info(
            f"Traditional pipeline | stt={s.stt_provider.value}"
            f" llm={s.llm_provider.value}/{s.llm_model}"
            f" tts={s.tts_provider.value}"
        )

        stt = self._build_stt()
        llm = self._build_llm(ruka)
        tts = self._build_tts()

        context = LLMContext(
            messages=[{"role": "system", "content": build_system_instruction()}],
        )
        user_agg, assistant_agg = LLMContextAggregatorPair(context)

        pipeline = Pipeline([
            transport.input(),
            stt,
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
        logger.info(
            f"Starting session {conversation_id} | mode={self._settings.pipeline_mode.value}"
        )

        self._ruka = KaprukaMCPTools()

        if self._settings.pipeline_mode == PipelineMode.TRADITIONAL:
            pipeline, _ = self._create_traditional_pipeline(transport, self._ruka)
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

        @transport.event_handler("on_client_connected")
        async def on_client_connected(transport_local, client):  # noqa: ANN001
            logger.info("Client connected")
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
