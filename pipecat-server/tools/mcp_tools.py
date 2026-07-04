"""Direct Kapruka MCP client for the Pipecat voice server.

Connects straight to the Kapruka MCP endpoint (Streamable HTTP) instead of
routing through the Next.js /api/voice-tools HTTP bridge. Tool results are
normalised inline (Python equivalents of lib/mcp/normalize.ts) and surfaced
to the browser via RTVI server-message pushes.

Falls back to the HTTP bridge for search_gifts when the seed catalogue is
needed (the full fallback logic lives in TypeScript; we call back to Next.js
only for that path). All other calls (delivery, tracking, product detail)
go directly to MCP.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import textwrap
from typing import Any, Awaitable, Callable, Optional

from loguru import logger

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.services.llm_service import FunctionCallParams

PushUI = Callable[[dict], Awaitable[None]]

MCP_URL = os.environ.get("KAPRUKA_MCP_URL", "https://mcp.kapruka.com/mcp")
VOICE_API_BASE = (
    os.environ.get("VOICE_API_BASE")
    or os.environ.get("RUKA_API_BASE", "http://localhost:3000")
).rstrip("/")
VOICE_API_TOKEN = os.environ.get("VOICE_API_TOKEN")


# ---------------------------------------------------------------------------
# Lightweight Python equivalents of lib/mcp/normalize.ts
# ---------------------------------------------------------------------------

_JUNK = re.compile(
    r"\b(specialGifts|Kpcondemand|Kpconly|Kpc|Catsymprod|catSymProd|CATSYMPROD"
    r"|Kaprukacakes|https?://\S+)\b",
    re.IGNORECASE,
)
_ENTITY = re.compile(r"n#(\d{2,5});|&#(\d{2,5});")


def _decode_entities(s: str) -> str:
    s = _ENTITY.sub(lambda m: chr(int(m.group(1) or m.group(2))), s)
    return (
        s.replace("namp;", "&").replace("&amp;", "&")
        .replace("nnbsp;", " ").replace("&nbsp;", " ")
        .replace("nquot;", '"').replace("&quot;", '"')
        .replace("napos;", "'").replace("&apos;", "'")
        .replace("`", "'")
    )


def _clean(text: Optional[str]) -> str:
    if not text:
        return ""
    s = _decode_entities(str(text))
    s = re.sub(r"[\u00a0\u2007\u202f]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _blurb(summary: Optional[str]) -> str:
    s = _clean(summary)
    if not s:
        return ""
    s = re.sub(r"^[\w ]{1,24}\s-\s", "", s)
    s = _JUNK.sub(" ", s)
    s = re.sub(r"\s*,\s*", ", ", s)
    s = re.sub(r"(,\s+){2,}", ", ", s)
    return re.sub(r"\s+", " ", s).strip()


def _truncate(s: str, max_len: int = 140) -> str:
    if len(s) <= max_len:
        return s
    return textwrap.shorten(s, width=max_len, placeholder="…")


def _money(raw: Optional[dict]) -> dict:
    if not raw:
        return {"amount": None, "currency": "LKR"}
    return {
        "amount": raw.get("amount"),
        "currency": (raw.get("currency") or "LKR").upper(),
    }


def _format_price(money: dict) -> str:
    if money.get("amount") is None:
        return "price on request"
    return f"{money['currency']} {money['amount']:,.0f}"


def _is_cake(raw: dict) -> bool:
    haystack = " ".join(
        str(v) for v in [
            raw.get("id"), raw.get("name"),
            (raw.get("category") or {}).get("name"),
            (raw.get("category") or {}).get("slug"),
            (raw.get("attributes") or {}).get("type"),
        ] if v
    ).lower()
    return "cake" in haystack


def _to_product(raw: dict) -> dict:
    """Normalise a search result item into our Product shape."""
    price = _money(raw.get("price"))
    compare = raw.get("compare_at_price")
    return {
        "id": raw.get("id", ""),
        "name": _clean(raw.get("name")),
        "blurb": _truncate(_blurb(raw.get("summary")), 140),
        "price": price,
        "compareAtPrice": _money(compare) if compare else None,
        "inStock": raw.get("in_stock", True),
        "stockLevel": raw.get("stock_level") or "unknown",
        "image": raw.get("image_url"),
        "category": _clean((raw.get("category") or {}).get("name")),
        "occasions": [],
        "isCake": _is_cake(raw),
        "shipsInternationally": raw.get("ships_internationally", False),
        "url": raw.get("url", ""),
    }


def _to_card(product: dict) -> dict:
    """Card-shaped product for RTVI push (used by add_to_cart / open_product)."""
    return {
        "id": product.get("id", ""),
        "name": product.get("name", ""),
        "price": product.get("price", {"amount": None, "currency": "LKR"}),
        "inStock": product.get("inStock", True),
        "image": product.get("image") or (product.get("images") or [None])[0],
        "url": product.get("url", ""),
    }


def _parse_delivery_cities(markdown: str) -> list[dict]:
    """Parse the markdown bullet list returned by kapruka_list_delivery_cities."""
    cities = []
    pattern = re.compile(r"^[-*]\s+\*\*(.+?)\*\*(?:\s+_aliases:\s*(.+?)_)?\s*$", re.MULTILINE)
    for m in pattern.finditer(markdown):
        cities.append({
            "name": m.group(1).strip(),
            "aliases": m.group(2).strip().split() if m.group(2) else [],
        })
    return cities


# Occasion id → Kapruka MCP category + reliable query (mirrors lib/catalog/occasions.ts)
_OCCASION_MCP: dict[str, dict[str, str]] = {
    "birthday": {"category": "birthday", "query": "birthday"},
    "anniversary": {"category": "anniversary", "query": "anniversary"},
    "romance": {"category": "lover", "query": "romance"},
    "wedding": {"category": "wedding", "query": "wedding"},
    "mother": {"category": "mother", "query": "mother"},
    "newborn": {"category": "newborn", "query": "newborn"},
    "sympathy": {"category": "sympathy", "query": "sympathy"},
    "corporate": {"category": "corporate", "query": "corporate"},
    "cakes": {"category": "cakes", "query": "cake"},
    "flowers": {"category": "flowers", "query": "flowers"},
    "chocolates": {"category": "Chocolates", "query": "chocolate"},
    "perfumes": {"category": "perfumes", "query": "perfume"},
    "fruit": {"category": "fruit", "query": "fruit"},
    "jewellery": {"category": "jewellery", "query": "jewellery"},
    "toys": {"category": "toys", "query": "toys"},
}


# ---------------------------------------------------------------------------
# MCP session helper
# ---------------------------------------------------------------------------

def _extract_tool_text(result: Any) -> Optional[str]:
    """Mirror lib/mcp/client.ts extractText — pull the payload string from MCP."""
    sc = getattr(result, "structuredContent", None)
    if isinstance(sc, dict) and isinstance(sc.get("result"), str):
        return sc["result"]
    content = getattr(result, "content", None) or []
    for part in content:
        text = getattr(part, "text", None)
        if isinstance(text, str):
            return text
    return None


def _parse_kapruka_json(text: str) -> Optional[dict | list]:
    """Parse Kapruka JSON tool responses; treat error strings as None."""
    trimmed = text.strip()
    if re.match(r"^Error(?:\s*\([^)]+\))?:", trimmed):
        logger.warning(f"MCP error: {trimmed[:200]}")
        return None
    if re.match(r"^No products found", trimmed, re.I):
        return {"results": []}
    try:
        return json.loads(trimmed)
    except json.JSONDecodeError:
        logger.warning(f"MCP non-JSON response: {trimmed[:200]}")
        return None


async def _call_mcp_tool(
    tool_name: str,
    params: dict,
    *,
    as_json: bool = True,
) -> Any:
    """Call a Kapruka MCP tool. All args must be wrapped under ``params``."""
    payload: dict[str, Any] = dict(params)
    if as_json:
        payload["response_format"] = "json"

    async with streamablehttp_client(MCP_URL) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, {"params": payload})
            text = _extract_tool_text(result)
            if text is None:
                return None
            if as_json:
                return _parse_kapruka_json(text)
            return text


def _search_results(raw: Any) -> list:
    """Safely pull ``results`` from a parsed MCP search payload."""
    if isinstance(raw, dict):
        results = raw.get("results")
        return results if isinstance(results, list) else []
    return []


def _norm_name(s: str) -> str:
    s = re.sub(r"[^\w\s]", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def _match_product_by_name(name: str, products: list[dict]) -> Optional[dict]:
    needle = _norm_name(name)
    if not needle:
        return None
    for p in products:
        if _norm_name(p.get("name", "")) == needle:
            return p
    for p in products:
        pn = _norm_name(p.get("name", ""))
        if needle in pn or pn in needle:
            return p
    # Token overlap — e.g. "Rosy Glow Gift Box" vs "Rosy Glow"
    tokens = [t for t in needle.split() if len(t) > 2]
    if len(tokens) >= 2:
        best: Optional[dict] = None
        best_score = 0
        for p in products:
            pn = _norm_name(p.get("name", ""))
            score = sum(1 for t in tokens if t in pn)
            if score > best_score:
                best_score = score
                best = p
        if best and best_score >= max(2, len(tokens) - 1):
            return best
    return None


def _slim_for_llm(product: dict) -> dict:
    """Id + name only — enough for follow-up tools, not a catalogue recital."""
    return {"id": product.get("id", ""), "name": product.get("name", "")}


def _build_search_mcp_args(
    query: str,
    occasion_id: Optional[str],
    min_price: Optional[float],
    max_price: Optional[float],
    in_stock_only: bool,
) -> dict[str, Any]:
    """Build Kapruka search params; disambiguate recipient vs product-type occasions."""
    mcp_args: dict[str, Any] = {
        "limit": 8,
        "sort": "relevance",
        "currency": "LKR",
    }
    q = (query or "").strip()
    occ_id = str(occasion_id) if occasion_id else ""
    occasion_keys = set(_OCCASION_MCP.keys())

    # e.g. query="mother", occasion="cakes" → cakes for mum, not mother-category gifts
    if q in occasion_keys and occ_id in occasion_keys and q != occ_id:
        product_occ = _OCCASION_MCP[occ_id]
        mcp_args["category"] = product_occ["category"]
        mcp_args["q"] = product_occ["query"]
    elif occ_id in _OCCASION_MCP:
        occ = _OCCASION_MCP[occ_id]
        mcp_args["category"] = occ["category"]
        if q and q not in occasion_keys:
            mcp_args["q"] = q
        else:
            mcp_args["q"] = occ["query"]
    elif q in _OCCASION_MCP:
        occ = _OCCASION_MCP[q]
        mcp_args["category"] = occ["category"]
        mcp_args["q"] = occ["query"]
    elif q:
        mcp_args["q"] = q

    if in_stock_only:
        mcp_args["in_stock_only"] = True
    if min_price is not None:
        mcp_args["min_price"] = min_price
    if max_price is not None:
        mcp_args["max_price"] = max_price
    return mcp_args


async def _search_via_next_api(
    *,
    query: str,
    occasion_id: Optional[str],
    min_price: Optional[float],
    max_price: Optional[float],
    in_stock_only: bool,
) -> tuple[list[dict], str, Optional[str], str]:
    """Fallback to Next.js /api/voice-tools — includes seed catalogue."""
    import aiohttp

    args: dict[str, Any] = {"inStockOnly": in_stock_only, "limit": 8}
    if query:
        args["query"] = query
    if occasion_id:
        args["occasionId"] = occasion_id
    if min_price is not None:
        args["minPrice"] = min_price
    if max_price is not None:
        args["maxPrice"] = max_price

    headers = {"content-type": "application/json"}
    if VOICE_API_TOKEN:
        headers["x-voice-token"] = VOICE_API_TOKEN

    url = f"{VOICE_API_BASE}/api/voice-tools"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json={"tool": "search_gifts", "args": args},
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=25),
            ) as resp:
                data = await resp.json()
    except Exception as exc:
        logger.warning(f"voice-tools search fallback failed: {exc}")
        return [], "Gift ideas", None, "live"

    if not isinstance(data, dict) or not data.get("ok"):
        return [], "Gift ideas", None, "live"

    products = data.get("products") or []
    occasion = data.get("occasion") or {}
    title = occasion.get("label") if isinstance(occasion, dict) else None
    if not title:
        title = query or (occasion_id or "Gift ideas").replace("_", " ").title()
    return (
        products if isinstance(products, list) else [],
        title,
        data.get("note"),
        data.get("source") or "live",
    )


# ---------------------------------------------------------------------------
# KaprukaMCPTools — same public interface as the legacy RukaTools class
# ---------------------------------------------------------------------------

class KaprukaMCPTools:
    """Wraps the Kapruka MCP tools with RTVI UI push side-effects.

    Provides the same ``schemas`` list and ``set_push_ui`` / ``register_on_llm``
    interface as the legacy RukaTools so that pipeline/service.py needs only a
    one-line swap.
    """

    def __init__(self) -> None:
        self._push_ui: PushUI = self._noop_push
        self._last_shown_products: list[dict] = []

    def set_push_ui(self, push_ui: PushUI) -> None:
        self._push_ui = push_ui

    async def _noop_push(self, _data: dict) -> None:
        return None

    async def _push(self, data: dict) -> None:
        try:
            await self._push_ui(data)
        except Exception as exc:
            logger.warning(f"RTVI push failed: {exc}")

    async def _fetch_product_raw(self, product_id: str) -> Optional[dict]:
        try:
            raw = await asyncio.wait_for(
                _call_mcp_tool(
                    "kapruka_get_product",
                    {"product_id": product_id, "currency": "LKR"},
                ),
                timeout=20,
            )
        except (asyncio.TimeoutError, Exception) as exc:
            logger.warning(f"MCP get_product failed for {product_id}: {exc}")
            return None
        return raw if isinstance(raw, dict) and raw.get("id") else None

    async def _get_gift_via_next_api(self, product_id: str) -> Optional[dict]:
        import aiohttp

        headers = {"content-type": "application/json"}
        if VOICE_API_TOKEN:
            headers["x-voice-token"] = VOICE_API_TOKEN
        url = f"{VOICE_API_BASE}/api/voice-tools"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json={"tool": "get_gift_details", "args": {"productId": product_id}},
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=25),
                ) as resp:
                    data = await resp.json()
        except Exception as exc:
            logger.warning(f"voice-tools get_gift_details failed: {exc}")
            return None
        if not isinstance(data, dict) or not data.get("ok"):
            return None
        product = data.get("product")
        return product if isinstance(product, dict) else None

    async def _resolve_product(
        self,
        product_id: str,
        product_name: Optional[str] = None,
    ) -> tuple[Optional[dict], str]:
        """Resolve a Kapruka product — never trust LLM-slug ids."""
        pid = (product_id or "").strip()
        name_hint = (product_name or "").strip()

        if pid:
            raw = await self._fetch_product_raw(pid)
            if raw:
                return raw, str(raw["id"])

        lookup_name = name_hint or pid.replace("_", " ")
        if lookup_name:
            on_screen = _match_product_by_name(lookup_name, self._last_shown_products)
            if on_screen:
                rid = str(on_screen.get("id", ""))
                if rid:
                    raw = await self._fetch_product_raw(rid)
                    if raw:
                        return raw, rid

        if lookup_name:
            try:
                search_raw = await asyncio.wait_for(
                    _call_mcp_tool(
                        "kapruka_search_products",
                        {
                            "q": lookup_name,
                            "limit": 8,
                            "sort": "relevance",
                            "currency": "LKR",
                            "in_stock_only": True,
                        },
                    ),
                    timeout=20,
                )
            except (asyncio.TimeoutError, Exception) as exc:
                logger.warning(f"MCP name search failed: {exc}")
                search_raw = None

            for item in _search_results(search_raw):
                prod = _to_product(item)
                if _match_product_by_name(lookup_name, [prod]):
                    rid = str(prod.get("id", ""))
                    if rid:
                        raw = await self._fetch_product_raw(rid)
                        if raw:
                            return raw, rid

        if pid:
            seed = await self._get_gift_via_next_api(pid)
            if seed and seed.get("id"):
                return seed, str(seed["id"])
        if lookup_name and lookup_name != pid:
            for candidate in self._last_shown_products:
                rid = str(candidate.get("id", ""))
                if rid:
                    seed = await self._get_gift_via_next_api(rid)
                    if seed and _match_product_by_name(lookup_name, [seed]):
                        return seed, str(seed["id"])

        return None, pid

    # ------------------------------------------------------------------
    # Tool handlers
    # ------------------------------------------------------------------

    async def search_gifts(self, params: FunctionCallParams) -> None:
        args = params.arguments or {}
        query = args.get("query") or ""
        occasion_id = args.get("occasion")
        min_price = args.get("min_price")
        max_price = args.get("max_price")
        in_stock_only = args.get("in_stock_only", True)

        mcp_args = _build_search_mcp_args(
            str(query),
            str(occasion_id) if occasion_id else None,
            min_price,
            max_price,
            bool(in_stock_only),
        )

        try:
            raw = await asyncio.wait_for(
                _call_mcp_tool("kapruka_search_products", mcp_args),
                timeout=20,
            )
        except (asyncio.TimeoutError, Exception) as exc:
            logger.warning(f"MCP search_gifts failed: {exc}")
            raw = None

        results = _search_results(raw) if raw is not None else []
        source = "live"
        note: Optional[str] = None

        if not results:
            # Seed catalogue + resilient search lives in Next.js — same as text chat.
            fb_products, fb_title, fb_note, fb_source = await _search_via_next_api(
                query=query,
                occasion_id=str(occasion_id) if occasion_id else None,
                min_price=min_price,
                max_price=max_price,
                in_stock_only=in_stock_only,
            )
            if not fb_products:
                await params.result_callback({"count": 0, "items": [], "shown_on_screen": False})
                return
            products = [
                p if "blurb" in p else _to_product(p) for p in fb_products
            ]
            title = fb_title
            note = fb_note
            source = fb_source
        else:
            products = [_to_product(r) for r in results]
            title = args.get("query") or (occasion_id or "Gift ideas").replace("_", " ").title()

        await self._push({
            "type": "products",
            "title": title,
            "products": products,
            "source": source,
            **({"note": note} if note else {}),
        })
        self._last_shown_products = products
        await params.result_callback({
            "count": len(products),
            "shown_on_screen": True,
            "items": [_slim_for_llm(p) for p in products[:8]],
        })

    async def get_gift_details(self, params: FunctionCallParams) -> None:
        args = params.arguments or {}
        product_id = str(args.get("product_id") or "")
        product_name = str(args.get("product_name") or "").strip() or None

        if not product_id and not product_name:
            await params.result_callback({"error": "I need the product id or name."})
            return

        raw, resolved_id = await self._resolve_product(product_id, product_name)
        if not raw:
            await params.result_callback({
                "error": "Product not found.",
                "hint": "Use the exact id from search_gifts items[], not a made-up slug.",
            })
            return

        product = _to_product(raw)
        images = raw.get("images") or []
        if images:
            product["image"] = images[0]
        product["images"] = images

        card = _to_card(product)
        self._last_shown_products = [product]
        await self._push({
            "type": "products",
            "title": product.get("name") or "Product details",
            "products": [product],
            "source": "live",
        })
        await self._push({"type": "open_product", "productId": resolved_id, "product": card})
        await params.result_callback({
            "shown_on_screen": True,
            "id": resolved_id,
            "name": product.get("name"),
            "price": _format_price(product.get("price", {})),
        })

    async def add_to_cart(self, params: FunctionCallParams) -> None:
        args = params.arguments or {}
        product_id = str(args.get("product_id") or "")
        product_name = str(args.get("product_name") or "").strip() or None
        quantity = int(args.get("quantity") or 1)

        if not product_id and not product_name:
            await params.result_callback({"error": "I need the product id or name."})
            return

        raw, resolved_id = await self._resolve_product(product_id, product_name)
        if not raw:
            await params.result_callback({"error": "Product not found."})
            return

        product = _to_product(raw)
        card = _to_card(product)
        await self._push({"type": "add_to_cart", "product": card, "quantity": quantity})
        await params.result_callback({
            "added": True,
            "id": resolved_id,
            "name": product.get("name"),
            "shown_on_screen": True,
        })

    async def open_checkout(self, params: FunctionCallParams) -> None:
        await self._push({"type": "open_checkout"})
        await params.result_callback({"opened": True, "note": "Checkout drawer opened on screen."})

    async def show_gift_finder(self, params: FunctionCallParams) -> None:
        await self._push({"type": "show_gift_finder"})
        await params.result_callback({
            "shown": True,
            "note": "Category picker is on screen — caller can tap categories and optional budget.",
        })

    async def end_call(self, params: FunctionCallParams) -> None:
        await self._push({"type": "end_call"})
        await params.result_callback({"ended": True})

    async def show_checkout_form(self, params: FunctionCallParams) -> None:
        args = params.arguments or {}
        step = str(args.get("step") or "review")
        await self._push({"type": "show_checkout_form", "step": step})
        await params.result_callback({"shown": True, "step": step, "note": "In-chat checkout form is on screen."})

    async def suggest_gift_message(self, params: FunctionCallParams) -> None:
        args = params.arguments or {}
        message = str(args.get("message") or "").strip()[:300]
        if not message:
            await params.result_callback({"error": "I need message text."})
            return
        await self._push({"type": "suggest_gift_message", "message": message})
        await params.result_callback({"applied": True, "message": message, "shown_on_screen": True})

    async def find_delivery_cities(self, params: FunctionCallParams) -> None:
        args = params.arguments or {}
        query = str(args.get("query") or "")

        try:
            raw = await asyncio.wait_for(
                _call_mcp_tool("kapruka_list_delivery_cities", {"query": query, "limit": 12}, as_json=False),
                timeout=15,
            )
        except (asyncio.TimeoutError, Exception) as exc:
            logger.warning(f"MCP find_delivery_cities failed: {exc}")
            await params.result_callback({"error": "Couldn't look that up right now."})
            return

        # The MCP tool may return markdown text or already-parsed JSON.
        if isinstance(raw, str):
            cities = _parse_delivery_cities(raw)
        elif isinstance(raw, list):
            cities = [{"name": c.get("name", c) if isinstance(c, dict) else str(c), "aliases": []} for c in raw]
        else:
            cities = []

        await params.result_callback({
            "matches": [c["name"] for c in cities[:8]],
            "serviceable": len(cities) > 0,
        })

    async def check_delivery(self, params: FunctionCallParams) -> None:
        args = params.arguments or {}
        city = str(args.get("city") or "")
        date = str(args.get("date") or "")
        product_id = args.get("product_id")

        mcp_args: dict[str, Any] = {"city": city, "delivery_date": date}
        if product_id:
            mcp_args["product_id"] = str(product_id)

        try:
            raw = await asyncio.wait_for(
                _call_mcp_tool("kapruka_check_delivery", mcp_args),
                timeout=20,
            )
        except (asyncio.TimeoutError, Exception) as exc:
            logger.warning(f"MCP check_delivery failed: {exc}")
            await params.result_callback({"error": "Couldn't check delivery right now."})
            return

        if not raw or not isinstance(raw, dict):
            await params.result_callback({"error": "No delivery info available."})
            return

        quote = {
            "city": raw.get("city", city),
            "date": raw.get("checked_date", date),
            "available": bool(raw.get("available", False)),
            "rate": raw.get("rate", 0),
            "currency": (raw.get("currency") or "LKR").upper(),
        }
        await self._push({"type": "delivery_quote", "quote": quote})
        await params.result_callback({
            "available": quote["available"],
            "fee": _format_price({"amount": quote["rate"], "currency": quote["currency"]}),
            "city": quote["city"],
            "date": quote["date"],
        })

    async def track_order(self, params: FunctionCallParams) -> None:
        args = params.arguments or {}
        order_number = str(args.get("order_number") or "")

        try:
            raw = await asyncio.wait_for(
                _call_mcp_tool("kapruka_track_order", {"order_number": order_number}),
                timeout=20,
            )
        except (asyncio.TimeoutError, Exception) as exc:
            logger.warning(f"MCP track_order failed: {exc}")
            await params.result_callback({"error": "Couldn't find that order right now."})
            return

        if not raw or not isinstance(raw, dict):
            await params.result_callback({"error": "Order not found."})
            return

        await self._push({"type": "track_order", "order": raw})
        await params.result_callback({
            "orderNumber": raw.get("order_number", order_number),
            "status": raw.get("status_display") or raw.get("status"),
            "shown_on_screen": True,
        })

    # ------------------------------------------------------------------
    # Schema list + LLM registration (same interface as RukaTools)
    # ------------------------------------------------------------------

    @property
    def schemas(self) -> list[FunctionSchema]:
        return [
            FunctionSchema(
                name="search_gifts",
                description="Find gifts; product cards appear on the caller's screen.",
                properties={
                    "query": {"type": "string"},
                    "occasion": {
                        "type": "string",
                        "enum": [
                            "birthday", "anniversary", "romance", "wedding", "mother",
                            "newborn", "sympathy", "corporate", "cakes", "flowers",
                            "chocolates", "perfumes", "fruit", "jewellery", "toys",
                        ],
                    },
                    "min_price": {"type": "number"},
                    "max_price": {"type": "number"},
                    "in_stock_only": {"type": "boolean"},
                },
                required=[],
                handler=self.search_gifts,
            ),
            FunctionSchema(
                name="get_gift_details",
                description=(
                    "Full details for one product. Use the exact id from search_gifts "
                    "items[] — never invent ids from the product name."
                ),
                properties={
                    "product_id": {
                        "type": "string",
                        "description": "Exact Kapruka product id from search_gifts items[].",
                    },
                    "product_name": {
                        "type": "string",
                        "description": "Product name if id is unknown — matched against on-screen results.",
                    },
                },
                required=[],
                handler=self.get_gift_details,
            ),
            FunctionSchema(
                name="add_to_cart",
                description="Add a product to the cart.",
                properties={
                    "product_id": {
                        "type": "string",
                        "description": "Exact Kapruka product id from search_gifts items[].",
                    },
                    "product_name": {"type": "string"},
                    "quantity": {"type": "integer"},
                },
                required=[],
                handler=self.add_to_cart,
            ),
            FunctionSchema(
                name="open_checkout",
                description="Open the checkout drawer on screen.",
                properties={},
                required=[],
                handler=self.open_checkout,
            ),
            FunctionSchema(
                name="show_gift_finder",
                description=(
                    "Open the on-screen category picker when the caller is stuck choosing "
                    "a gift type. Not on the first turn."
                ),
                properties={},
                required=[],
                handler=self.show_gift_finder,
            ),
            FunctionSchema(
                name="end_call",
                description=(
                    "End the voice call. Call in the SAME turn as the farewell phrase, "
                    "never before saying goodbye."
                ),
                properties={},
                required=[],
                handler=self.end_call,
            ),
            FunctionSchema(
                name="show_checkout_form",
                description=(
                    "Open in-chat checkout on the chat panel. "
                    "step: review | collect | confirm | payment"
                ),
                properties={
                    "step": {
                        "type": "string",
                        "enum": ["review", "collect", "confirm", "payment"],
                    },
                },
                required=["step"],
                handler=self.show_checkout_form,
            ),
            FunctionSchema(
                name="suggest_gift_message",
                description="Write and apply a gift card message (max 300 chars).",
                properties={"message": {"type": "string"}},
                required=["message"],
                handler=self.suggest_gift_message,
            ),
            FunctionSchema(
                name="find_delivery_cities",
                description="Look up a Sri Lankan delivery city by name.",
                properties={"query": {"type": "string"}},
                required=["query"],
                handler=self.find_delivery_cities,
            ),
            FunctionSchema(
                name="check_delivery",
                description="Check delivery availability and fee for a city + date.",
                properties={
                    "city": {"type": "string"},
                    "date": {"type": "string", "description": "YYYY-MM-DD"},
                    "product_id": {"type": "string"},
                },
                required=["city", "date"],
                handler=self.check_delivery,
            ),
            FunctionSchema(
                name="track_order",
                description="Track a Kapruka order by order number.",
                properties={"order_number": {"type": "string"}},
                required=["order_number"],
                handler=self.track_order,
            ),
        ]

    def register_on_llm(self, llm: Any) -> None:
        """Register all function handlers on a traditional (non-Gemini-Live) LLM service."""
        for schema in self.schemas:
            llm.register_function(schema.name, schema.handler)
