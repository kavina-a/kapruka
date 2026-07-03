"""STUN/TURN for SmallWebRTC — TURN is required for browser ↔ Railway."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from loguru import logger

from pipecat.transports.smallwebrtc.connection import IceServer

DEFAULT_STUN = [
    "stun:stun.relay.metered.ca:80",
    "stun:stun.l.google.com:19302",
]


def _is_cloud_deploy() -> bool:
    return bool(os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_PUBLIC_DOMAIN"))


def _parse_json_servers(raw: str) -> list[IceServer]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    servers: list[IceServer] = []
    for entry in data:
        if not isinstance(entry, dict) or "urls" not in entry:
            continue
        servers.append(
            IceServer(
                urls=entry["urls"],
                username=entry.get("username") or entry.get("user"),
                credential=entry.get("credential") or entry.get("password"),
            )
        )
    return servers


def _fetch_metered_servers() -> list[IceServer]:
    api_key = (os.getenv("METERED_TURN_API_KEY") or "").strip()
    app = (os.getenv("METERED_TURN_APP") or "").strip()
    if not api_key or not app:
        return []

    url = f"https://{app}.metered.live/api/v1/turn/credentials?apiKey={api_key}"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.error(f"Metered TURN API failed: {exc}")
        return []

    if not isinstance(data, list):
        return []

    servers: list[IceServer] = []
    for entry in data:
        if not isinstance(entry, dict) or "urls" not in entry:
            continue
        servers.append(
            IceServer(
                urls=entry["urls"],
                username=entry.get("username"),
                credential=entry.get("credential"),
            )
        )
    return servers


def _build_turn_env_servers() -> list[IceServer]:
    turn_url = (os.getenv("TURN_URL") or "").strip()
    if not turn_url:
        return []

    username = os.getenv("TURN_USERNAME") or ""
    credential = os.getenv("TURN_CREDENTIAL") or ""
    servers = [IceServer(urls=u.strip()) for u in DEFAULT_STUN]
    for url in turn_url.split(","):
        trimmed = url.strip()
        if trimmed:
            servers.append(IceServer(urls=trimmed, username=username, credential=credential))
    return servers


def _has_turn(servers: list[IceServer]) -> bool:
    for s in servers:
        urls = s.urls if isinstance(s.urls, str) else " ".join(s.urls)
        if urls.startswith("turn:") or urls.startswith("turns:"):
            return True
    return False


def load_ice_servers() -> list[IceServer]:
    json_raw = (os.getenv("ICE_SERVERS_JSON") or "").strip()
    if json_raw:
        parsed = _parse_json_servers(json_raw)
        if parsed:
            logger.info(f"ICE from ICE_SERVERS_JSON ({len(parsed)} servers, turn={_has_turn(parsed)})")
            return parsed

    metered = _fetch_metered_servers()
    if metered:
        logger.info(f"ICE from Metered API ({len(metered)} servers, turn={_has_turn(metered)})")
        return metered

    turn_env = _build_turn_env_servers()
    if _has_turn(turn_env):
        logger.info(f"ICE from TURN_URL env ({len(turn_env)} servers)")
        return turn_env

    stun = os.getenv("PIPECAT_ICE_STUN", ",".join(DEFAULT_STUN))
    servers = [IceServer(urls=u.strip()) for u in stun.split(",") if u.strip()]

    if _is_cloud_deploy():
        logger.error(
            "No TURN server configured on Railway — WebRTC audio will NOT connect. "
            "Set METERED_TURN_API_KEY + METERED_TURN_APP (free: metered.ca/tools/openrelay) "
            "or ICE_SERVERS_JSON / TURN_URL on Railway."
        )
    else:
        logger.warning(f"ICE STUN-only ({len(servers)} servers) — OK for localhost dev")

    return servers
