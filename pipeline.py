import asyncio
import logging
import time
import uuid

from openai.types.chat import ChatCompletionMessageParam
from openai.types.chat import ChatCompletionSystemMessageParam
from openai.types.chat import ChatCompletionUserMessageParam

from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask
from pipecat.pipeline.task import PipelineParams


from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
)
from pipecat.processors.aggregators.llm_response_universal import (
    LLMUserAggregatorParams,
)
from pipecat.turns.user_turn_strategies import UserTurnStrategies
from pipecat.turns.user_stop.turn_analyzer_user_turn_stop_strategy import (
    TurnAnalyzerUserTurnStopStrategy,
)

from pipecat.processors.frameworks.rtvi import RTVIObserver
from pipecat.processors.frameworks.rtvi import RTVIObserverParams
from pipecat.processors.frameworks.rtvi import RTVIFunctionCallReportLevel
from pipecat.processors.frameworks.rtvi import RTVIProcessor

from pipecat.transports.base_transport import BaseTransport
from pipecat.transports.livekit.transport import LiveKitTransport
from pipecat.transports.websocket.fastapi import FastAPIWebsocketTransport

from pipecat.services.stt_service import STTService
from pipecat.services.llm_service import LLMService
from pipecat.services.tts_service import TTSService

from pipecat.services.mcp_service import MCPClient
from mcp.client.session_group import StreamableHttpParameters
from pipecat.adapters.schemas.tools_schema import ToolsSchema

from pipecat.frames.frames import InputTextRawFrame, LLMRunFrame

from typing import Callable, Dict
from typing import Any
from typing import Tuple
from typing import Optional
from typing import List

from app.core.models.stt import SttConfiguration
from app.core.models.stt import get_audio_configuration_by_stt_configuration
from app.core.models.llm import LlmConfiguration, RealtimeLlmProvider
from app.core.models.llm import RealtimeLlmConfiguration
from app.core.models.llm import (
    get_input_audio_configuration_by_realtime_llm_configuration,
)
from app.core.models.llm import (
    get_output_audio_configuration_by_realtime_llm_configuration,
)
from app.core.models.tts import TtsConfiguration
from app.core.models.tts import get_audio_configuration_by_tts_configuration

from app.core.models.agent import PipelineConfigurationType
from app.core.models.agent import PipelineConfigurationTraditional
from app.core.models.agent import PipelineConfigurationRealtime

from app.core.models.agent import Agent, PipelineInitiatedSource
from app.core.models.agent import PipelineSourceInfo

from app.core.models.audio import AudioConfiguration

from app.core.ports.knowledge_base import VectorStore
from app.core.ports.knowledge_base import EmbeddingModel
from app.core.ports.email import EmailClient
from app.core.ports.message_queue import MessageQueue

from app.tools import ToolRegistry
from app.tools.builtin import KnowledgeBaseTool
from app.tools.builtin import EmailTool
from app.tools.builtin import RestApiTool
from app.tools.builtin import EndConversationTool
from app.tools.builtin import DateInfoTool
from app.tools.builtin import SipTransferTool

from app.config import settings

from app.contexts import conversation_id_context, correlation_id_context

from app.observability import TraceFunction

from app.ext.pipecat.analytics_observer import AnalyticsObserver
from app.ext.pipecat.rtvi_observer import ExtendedRtviObserver
from app.ext.pipecat.silero_vad_analyzer import create_vad_analyzer, create_smart_turn_analyzer
from app.ext.pipecat.webhook_lifecycle_observer import WebhookLifecycleObserver
from app.services.lifecycle_webhook import LifecycleWebhookService

import httpx
import traceback

logger = logging.getLogger(__name__)


# ==============================================
# Pipeline Service
# ==============================================


class PipelineService:
    def __init__(
        self,
        stt_service_factory: Callable[
            [SttConfiguration, Optional[AudioConfiguration]], STTService
        ],
        llm_service_factory: Callable[[LlmConfiguration], LLMService],
        tts_service_factory: Callable[
            [TtsConfiguration, Optional[AudioConfiguration]], TTSService
        ],
        sts_service_factory: Callable[
            [
                RealtimeLlmConfiguration,
                Optional[AudioConfiguration],
                Optional[AudioConfiguration],
                Optional[str],
            ],
            LLMService,
        ],
        vector_store: VectorStore,
        embedding_model: EmbeddingModel,
        email_client: EmailClient,
        analytics_message_queue: MessageQueue,
    ):
        self._stt_service_factory: Callable[
            [SttConfiguration, Optional[AudioConfiguration]], STTService
        ] = stt_service_factory
        self._llm_service_factory: Callable[[LlmConfiguration], LLMService] = (
            llm_service_factory
        )
        self._tts_service_factory: Callable[
            [TtsConfiguration, Optional[AudioConfiguration]], TTSService
        ] = tts_service_factory
        self._sts_service_factory: Callable[
            [
                RealtimeLlmConfiguration,
                Optional[AudioConfiguration],
                Optional[AudioConfiguration],
                Optional[str],
            ],
            LLMService,
        ] = sts_service_factory

        self._vector_store = vector_store
        self._embedding_model = embedding_model
        self._email_client = email_client
        self._analytics_message_queue = analytics_message_queue

        self._tool_registry = ToolRegistry()

        self._pipeline_task: Optional[PipelineTask] = None
        self._egress_id: Optional[str] = None
        self._livekit_service = None
        self._conversation_id: Optional[str] = None
        self._webhook_service: Optional[LifecycleWebhookService] = None

    @TraceFunction(
        "pipeline_service._create_traditional_pipeline",
        span_kind="service",
    )
    def _create_traditional_pipeline(
        self,
        transport: BaseTransport,
        rtvi_processor: Optional[RTVIProcessor],
        pipeline_configuration: PipelineConfigurationTraditional,
        context: LLMContext,
        input_audio_configuration: Optional[AudioConfiguration],
        output_audio_configuration: Optional[AudioConfiguration],
    ) -> Tuple[Pipeline, Any, Any]:
        t0 = time.perf_counter()
        stt = self._stt_service_factory(
            pipeline_configuration.stt_configuration, input_audio_configuration
        )
        logger.info(
            f"[PROFILE] pipeline | stt_factory: {(time.perf_counter()-t0)*1000:.1f}ms"
        )

        t1 = time.perf_counter()
        llm = self._llm_service_factory(pipeline_configuration.llm_configuration)
        self._tool_registry.register_tool_callbacks_on_llm(llm)
        logger.info(
            f"[PROFILE] pipeline | llm_factory: {(time.perf_counter()-t1)*1000:.1f}ms"
        )

        t2 = time.perf_counter()
        tts = self._tts_service_factory(
            pipeline_configuration.tts_configuration, output_audio_configuration
        )
        logger.info(
            f"[PROFILE] pipeline | tts_factory: {(time.perf_counter()-t2)*1000:.1f}ms"
        )

        _turn_analyzer = create_smart_turn_analyzer()
        user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
            context,
            user_params=LLMUserAggregatorParams(
                vad_analyzer=create_vad_analyzer(PipelineConfigurationType.TRADITIONAL),
                user_turn_strategies=(
                    UserTurnStrategies(
                        stop=[
                            TurnAnalyzerUserTurnStopStrategy(
                                turn_analyzer=_turn_analyzer
                            )
                        ]
                    )
                    if _turn_analyzer
                    else None
                ),
            ),
        )

        frame_processors = [
            transport.input(),
            stt,
            user_aggregator,
            llm,
            tts,
            transport.output(),
            assistant_aggregator,
        ]

        return Pipeline(frame_processors), user_aggregator, assistant_aggregator

    @TraceFunction(
        "pipeline_service._create_realtime_pipeline",
        span_kind="service",
    )
    def _create_realtime_pipeline(
        self,
        transport: BaseTransport,
        rtvi_processor: Optional[RTVIProcessor],
        pipeline_configuration: PipelineConfigurationRealtime,
        context: LLMContext,
        input_audio_configuration: Optional[AudioConfiguration],
        output_audio_configuration: Optional[AudioConfiguration],
    ) -> Tuple[Pipeline, Any, Any]:
        # Extract system instructions from context
        instructions = None
        if context and context.messages:
            for msg in context.messages:
                if msg.get("role") == "system":
                    instructions = msg.get("content")
                    break

        sts = self._sts_service_factory(
            pipeline_configuration.llm_configuration,
            input_audio_configuration,
            output_audio_configuration,
            instructions,
        )
        self._tool_registry.register_tool_callbacks_on_llm(sts)

        _turn_analyzer = create_smart_turn_analyzer()
        user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
            context,
            user_params=LLMUserAggregatorParams(
                vad_analyzer=create_vad_analyzer(
                    PipelineConfigurationType.REALTIME,
                ),
                user_turn_strategies=(
                    UserTurnStrategies(
                        stop=[
                            TurnAnalyzerUserTurnStopStrategy(
                                turn_analyzer=_turn_analyzer
                            )
                        ]
                    )
                    if _turn_analyzer
                    else None
                ),
            ),
        )

        frame_processors = [
            transport.input(),
            user_aggregator,
            sts,
            transport.output(),
            assistant_aggregator,
        ]

        return Pipeline(frame_processors), user_aggregator, assistant_aggregator

    @TraceFunction("pipeline_traditional.initialize", span_kind="pipeline")
    async def initialize(
        self,
        transport: BaseTransport,
        agent: Agent,
        input_audio_configuration: Optional[AudioConfiguration],
        output_audio_configuration: Optional[AudioConfiguration],
        rtvi_processor: Optional[RTVIProcessor] = None,
        pipeline_initiated_source: Optional[PipelineSourceInfo] = None,
        from_number: str = None,
        to_number: str = None,
        egress_id: Optional[str] = None,
        livekit_service=None,
        room_name: Optional[str] = None,
    ):

        try:
            conversation_id = conversation_id_context.get()
        except LookupError:
            conversation_id = "conv-" + str(uuid.uuid4())

        self._egress_id = egress_id
        self._livekit_service = livekit_service
        self._conversation_id = conversation_id

        is_livekit = isinstance(transport, LiveKitTransport)
        is_fastapi_websocket = isinstance(transport, FastAPIWebsocketTransport)

        MCPAgentData = agent.mcp_data if agent.mcp_data is not None else []

        for mcpServer in MCPAgentData:
            mcp_client = MCPClient(
                server_params=StreamableHttpParameters(
                    url=mcpServer.url,
                    headers=mcpServer.headers or {},
                ),
                tools_filter=mcpServer.tools_filter,  # None = all tools, list = only selected
            )

            try:
                await self._tool_registry.register_mcp_server(mcp_client)
            except Exception as e:
                error_msg = traceback.format_exc()
                if "401" in error_msg or "unauthorized" in error_msg.lower():
                    logger.warning(
                        f"Caught 401 Unauthorized for MCP server {mcpServer.url}. Attempting token refresh."
                        f"Attempting token refresh, error={e!r}",
                        exc_info=True,
                        extra={"functionName": "pipeline_service.initialize"},
                    )
                    try:
                        refresh_url = f"{settings.bff.base_url}/internal/mcp-servers/{mcpServer.server_id}/refresh-token"

                        logger.info(
                            f"Refreshing token at {refresh_url}",
                            extra={"functionName": "pipeline_service.initialize"},
                        )
                        async with httpx.AsyncClient() as client:
                            refresh_resp = await client.post(
                                refresh_url,
                                auth=(
                                    settings.bff.basic_auth_username,
                                    settings.bff.basic_auth_password,
                                ),
                                timeout=10.0,
                            )
                            refresh_resp.raise_for_status()
                            new_config = refresh_resp.json()

                        # Apply new config
                        mcpServer.url = new_config.get("url", mcpServer.url)
                        mcpServer.headers = new_config.get("headers", mcpServer.headers)

                        retry_client = MCPClient(
                            server_params=StreamableHttpParameters(
                                url=mcpServer.url,
                                headers=mcpServer.headers or {},
                            ),
                            tools_filter=mcpServer.tools_filter,
                        )
                        logger.info(
                            f"Retrying MCP server registration for {mcpServer.url} after refresh.",
                            extra={"functionName": "pipeline_service.initialize"},
                        )
                        await self._tool_registry.register_mcp_server(retry_client)
                    except Exception as refresh_error:
                        logger.error(
                            "Failed to refresh token and re-register MCP server at %s error=%r",
                            mcpServer.url,
                            refresh_error,
                            extra={"functionName": "pipeline_service.initialize"},
                        )
                else:
                    logger.error(
                        f"Failed to register MCP server at {mcpServer.url}:error={e!r}",
                        exc_info=True,
                        extra={"functionName": "pipeline_service.initialize"},
                    )
            finally:
                continue

        # Register Knowledge Base Tool
        self._tool_registry.register_tool(
            KnowledgeBaseTool(
                knowledge_base_ids=[kb.id for kb in agent.knowledge_bases],
                vector_store=self._vector_store,
                embedding_model=self._embedding_model,
            )
        )

        if agent.settings.smtp_settings:
            self._tool_registry.register_tool(
                EmailTool(
                    email_client=self._email_client,
                    smtp_settings=agent.settings.smtp_settings,
                )
            )

        self._tool_registry.register_tool(DateInfoTool())

        end_conversation_tool = EndConversationTool()
        self._tool_registry.register_tool(end_conversation_tool)

        # Register SIP transfer tool for LiveKit transports (SIP calls)
        if is_livekit and livekit_service is not None and room_name is not None:
            logger.info(f"Registering SIP transfer tool for room: {room_name}")
            self._tool_registry.register_tool(
                SipTransferTool(
                    livekit_service=livekit_service,
                    room_name=room_name,
                    sip_participant_identity=None,
                )
            )
        elif is_livekit and room_name is None:
            logger.warning(
                "LiveKit transport detected but room_name not provided - SIP transfer tool will not be available"
            )

        for user_defined_tool in agent.user_defined_tools:
            self._tool_registry.register_tool(RestApiTool(user_defined_tool))

        system_message = agent.settings.system_prompt

        # Add greeting instruction to system prompt if greet_first is enabled
        if agent.settings.greet_first:
            system_message += "\n\nIMPORTANT: This conversation has just started. You MUST begin by greeting the user warmly and introducing yourself. Do not wait for the user to speak first. Generate your greeting response immediately."

        system_message += "\n\n"
        system_message += self._tool_registry.get_tool_instructions()

        # Create context and context aggregator for the LLM service
        messages: List[ChatCompletionMessageParam] = [
            ChatCompletionSystemMessageParam(role="system", content=system_message)
        ]
        context = LLMContext(
            messages=messages, tools=self._tool_registry.create_tool_schema()
        )

        if agent.pipeline_configuration_type == PipelineConfigurationType.TRADITIONAL:
            assert isinstance(
                agent.pipeline_configuration, PipelineConfigurationTraditional
            )

            if input_audio_configuration is None:
                assert agent.pipeline_configuration.stt_configuration is not None
                input_audio_configuration = (
                    get_audio_configuration_by_stt_configuration(
                        agent.pipeline_configuration.stt_configuration
                    )
                )

            if output_audio_configuration is None:
                assert agent.pipeline_configuration.tts_configuration is not None
                output_audio_configuration = (
                    get_audio_configuration_by_tts_configuration(
                        agent.pipeline_configuration.tts_configuration
                    )
                )

            pipeline, user_aggregator, assistant_aggregator = self._create_traditional_pipeline(
                transport=transport,
                rtvi_processor=rtvi_processor,
                pipeline_configuration=agent.pipeline_configuration,
                context=context,
                input_audio_configuration=input_audio_configuration,
                output_audio_configuration=output_audio_configuration,
            )
        elif agent.pipeline_configuration_type == PipelineConfigurationType.REALTIME:
            assert isinstance(
                agent.pipeline_configuration, PipelineConfigurationRealtime
            )

            if input_audio_configuration is None:
                assert agent.pipeline_configuration.llm_configuration is not None
                input_audio_configuration = (
                    get_input_audio_configuration_by_realtime_llm_configuration(
                        agent.pipeline_configuration.llm_configuration
                    )
                )

            if output_audio_configuration is None:
                assert agent.pipeline_configuration.llm_configuration is not None
                output_audio_configuration = (
                    get_output_audio_configuration_by_realtime_llm_configuration(
                        agent.pipeline_configuration.llm_configuration
                    )
                )

            pipeline, user_aggregator, assistant_aggregator = self._create_realtime_pipeline(
                transport=transport,
                rtvi_processor=rtvi_processor,
                pipeline_configuration=agent.pipeline_configuration,
                context=context,
                input_audio_configuration=input_audio_configuration,
                output_audio_configuration=output_audio_configuration,
            )
        else:
            raise ValueError(
                f"Unsupported pipeline configuration type: {agent.pipeline_configuration_type}"
            )

        observers = []

        if rtvi_processor is not None:
            observers.append(ExtendedRtviObserver(rtvi_processor))

        custom_observer = AnalyticsObserver(
            message_queue=self._analytics_message_queue,
            pipeline_type=agent.pipeline_configuration_type,
            pipeline_initiated_source=pipeline_initiated_source,
            from_number=from_number,
            to_number=to_number,
            org_id=agent.metadata.organization_id,
        )
        observers.append(custom_observer)

        if agent.webhooks:
            self._webhook_service = LifecycleWebhookService(
                webhooks=agent.webhooks,
                agent_id=agent.metadata.id,
                conversation_id=conversation_id,
            )
            observers.append(WebhookLifecycleObserver(self._webhook_service))
            logger.info(
                "Lifecycle webhooks enabled for agent %s (events: %s)",
                agent.metadata.id,
                list(agent.webhooks.keys()),
            )
        else:
            logger.info(
                "Lifecycle webhooks disabled for agent %s (webhooks map empty after load)",
                agent.metadata.id,
            )

        # When RTVI is enabled, disable function-call reporting in the auto-created
        # RTVIObserver because ExtendedRtviObserver already sends richer custom
        # messages for those events.
        rtvi_observer_params = None
        if rtvi_processor is not None:
            rtvi_observer_params = RTVIObserverParams(
                function_call_report_level={"*": RTVIFunctionCallReportLevel.DISABLED}
            )

        self._pipeline_task = PipelineTask(
            pipeline,
            params=PipelineParams(
                allow_interruptions=True,
                audio_in_sample_rate=input_audio_configuration.sample_rate,
                audio_out_sample_rate=output_audio_configuration.sample_rate,
                enable_heartbeats=settings.pipecat.pipeline.params.enable_heartbeats,
                enable_metrics=settings.pipecat.pipeline.params.enable_metrics,
                enable_usage_metrics=settings.pipecat.pipeline.params.enable_usage_metrics,
                report_only_initial_ttfb=settings.pipecat.pipeline.params.report_only_initial_ttfb,
                send_initial_empty_metrics=settings.pipecat.pipeline.params.send_initial_empty_metrics,
                start_metadata=agent.metadata.model_dump(by_alias=True),
            ),
            enable_rtvi=rtvi_processor is not None,
            rtvi_processor=rtvi_processor,
            rtvi_observer_params=rtvi_observer_params,
            enable_tracing=settings.pipecat.pipeline.enable_tracing,
            enable_turn_tracking=settings.pipecat.pipeline.enable_turn_tracking,
            conversation_id=conversation_id,
            observers=observers,
        )

        end_conversation_tool.set_pipeline_task(self._pipeline_task)

        logger.info(f"Agent greet_first setting: {agent.settings.greet_first}")
        logger.info(f"RTVI processor present: {rtvi_processor is not None}")
        logger.info(f"Transport type: {type(transport).__name__}")

        # Register greeting handlers based on transport type
        if is_fastapi_websocket:
            # For FastAPI WebSocket, use the old approach with context manipulation
            @transport.event_handler("on_client_connected")
            @TraceFunction("pipeline.on_client_connected", span_kind="pipeline")
            async def on_client_connected(transport_local, client):
                print(
                    "Registering on_client_connected handler for FastAPI WebSocketTransport"
                )
                logger.info("Client connected: %s", client)
                # If greet_first is enabled, add a greeting message to the context
                if agent.settings.greet_first:
                    greeting_message = ChatCompletionUserMessageParam(
                        role="user",
                        content="This is a message from the application. Greet the user as specified in the system message.",
                    )
                    messages.append(greeting_message)
                    await self._pipeline_task.queue_frames([LLMRunFrame()])

            @transport.event_handler("on_client_disconnected")
            @TraceFunction("pipeline.on_client_disconnected", span_kind="pipeline")
            async def on_client_disconnected(transport_local, client):
                logger.info("Client disconnected")
                await self._stop_recording()
                task = getattr(self, "_pipeline_task", None)
                if task is not None:
                    await task.cancel()

        elif is_livekit:
            is_realtime_pipeline = (
                agent.pipeline_configuration_type == PipelineConfigurationType.REALTIME
            )

            # For LiveKit, use on_first_participant_joined event
            @transport.event_handler("on_first_participant_joined")
            @TraceFunction("pipeline.on_first_participant_joined", span_kind="pipeline")
            async def on_first_participant_joined(transport_local, participant):
                logger.info("First participant joined: %s", participant)
                if rtvi_processor:
                    logger.info("Signaling RTVI bot ready")
                    await rtvi_processor.set_bot_ready()

                if agent.settings.greet_first:
                    await self._pipeline_task.queue_frames([LLMRunFrame()])
                    logger.info("Greeting triggered successfully")
                else:
                    logger.info("greet_first disabled, not greeting")

            @transport.event_handler("on_participant_disconnected")
            @TraceFunction("pipeline.on_participant_disconnected", span_kind="pipeline")
            async def on_participant_disconnected(transport_local, participant):
                logger.info(
                    "Participant disconnected: %s - stopping recording", participant
                )
                await self._stop_recording()
                task = getattr(self, "_pipeline_task", None)
                if task is not None:
                    await task.cancel()

    async def _stop_recording(self):
        """Stop recording if active"""
        if self._egress_id and self._livekit_service:
            try:
                logger.info(
                    f"Stopping recording for conversation {self._conversation_id}, egress_id: {self._egress_id}"
                )
                await self._livekit_service.stop_egress(self._egress_id)
                logger.info(
                    f"Successfully stopped recording for conversation {self._conversation_id}, egress_id: {self._egress_id}"
                )
                self._egress_id = None  # Clear after stopping
            except Exception as e:
                error_msg = str(e)
                if (
                    "EGRESS_ABORTED" in error_msg
                    or "EGRESS_COMPLETE" in error_msg
                    or "cannot be stopped" in error_msg
                ):
                    logger.info(
                        f"Recording for conversation {self._conversation_id} already stopped/completed",
                        extra={
                            "functionName": "pipeline_service._stop_recording"
                        },
                    )
                else:
                    logger.error(
                        f"Failed to stop egress {self._egress_id}, error={e!r}",
                        extra={"functionName": "pipeline_service._stop_recording"},
                        exc_info=True,
                    )

    @TraceFunction("pipeline_traditional.run", span_kind="pipeline")
    async def run(self):
        runner = PipelineRunner(handle_sigint=False)
        try:
            await runner.run(self._pipeline_task)
        finally:
            logger.info(f"Pipeline ended - stopping recording")
            await self._stop_recording()
            if self._webhook_service is not None:
                await self._webhook_service.aclose()
