"""STUN/TURN for SmallWebRTC — needed for browser ↔ cloud (Railway) connections."""

from __future__ import annotations

import os

from pipecat.transports.smallwebrtc.connection import IceServer


def load_ice_servers() -> list[IceServer]:
    servers: list[IceServer] = []

    stun = os.getenv(
        "PIPECAT_ICE_STUN",
        "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302",
    )
    for url in stun.split(","):
        trimmed = url.strip()
        if trimmed:
            servers.append(IceServer(urls=trimmed))

    turn_url = (os.getenv("TURN_URL") or "").strip()
    if turn_url:
        servers.append(
            IceServer(
                urls=turn_url,
                username=os.getenv("TURN_USERNAME") or "",
                credential=os.getenv("TURN_CREDENTIAL") or "",
            )
        )

    return servers
