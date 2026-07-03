"""ChatRuka Pipecat server entry point.

Serves WebRTC signalling at POST /api/offer (default http://localhost:7860).
The Next.js app connects via @pipecat-ai/small-webrtc-transport.

Architecture (mini pipeline.py):
  Browser ──WebRTC──► Pipecat (this service)
                         ├─ Gemini Live (realtime) or STT+LLM+TTS (traditional)
                         ├─ RTVI (product cards, checkout, gift message → screen)
                         └─ HTTP tools ──► Next.js /api/voice-tools

Run:
    cd pipecat-server
    uv sync          # one-time: installs Python 3.11+ and deps
    uv run bot.py    # or from repo root: npm run pipecat:dev
"""

from __future__ import annotations

from loguru import logger

from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.transports.base_transport import TransportParams

from config import settings
from ice_config import load_ice_servers
from pipeline.service import PipelineService

transport_params = {
    "webrtc": lambda: TransportParams(
        audio_in_enabled=True,
        audio_out_enabled=True,
    ),
}


async def bot(runner_args: RunnerArguments) -> None:
    transport = await create_transport(runner_args, transport_params)
    service = PipelineService(settings)
    await service.run(transport, runner_args)


def _patch_webrtc_ice_servers() -> None:
    """Pipecat runner creates SmallWebRTCRequestHandler with no ICE servers by default."""
    ice = load_ice_servers()
    if not ice:
        return

    from pipecat.transports.smallwebrtc.request_handler import SmallWebRTCRequestHandler

    original_init = SmallWebRTCRequestHandler.__init__

    def patched_init(self, ice_servers=None, **kwargs):  # noqa: ANN001
        original_init(self, ice_servers=ice_servers or ice, **kwargs)

    SmallWebRTCRequestHandler.__init__ = patched_init
    logger.info(f"WebRTC ICE servers configured ({len(ice)})")


if __name__ == "__main__":
    import sys

    if settings.pipeline_mode.value == "realtime" and not settings.google_api_key:
        logger.error("GOOGLE_API_KEY is required for realtime pipeline.")
        raise SystemExit(1)

    # Pipecat runner defaults to localhost:7860; honour PIPECAT_HOST / PORT for Railway etc.
    if "--host" not in sys.argv:
        sys.argv.extend(["--host", settings.host])
    if "--port" not in sys.argv:
        sys.argv.extend(["--port", str(settings.port)])

    _patch_webrtc_ice_servers()

    from pipecat.runner.run import main

    main()
