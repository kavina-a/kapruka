"""ChatRuka's voice tools.

These are the functions Gemini Live can call during a voice call. Each one is a
thin wrapper that calls back into the Next.js app's internal `/api/voice-tools`
endpoint — so the voice agent shares ONE source of truth with the text agent:
the same resilient search, 90-product seed fallback, normalization and delivery
logic. Nothing about the catalogue is re-implemented here.

Two kinds of side effects happen per call:
  1. A concise result is returned to the model (so it can speak about it).
  2. A richer payload is pushed to the browser via an RTVI "server-message"
     (so the same product cards / cart / checkout render on screen).
"""

from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Callable, Optional

import aiohttp
from loguru import logger

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.services.llm_service import FunctionCallParams

PushUI = Callable[[dict], Awaitable[None]]


def _format_price(price: Optional[dict]) -> str:
    """Turn a Money object ({amount, currency}) into something speakable."""
    if not price or price.get("amount") is None:
        return "price on request"
    amount = price["amount"]
    currency = price.get("currency", "LKR")
    return f"{currency} {amount:,.0f}"


def _slim_product(p: dict) -> dict:
    """A compact view for the LLM — names + prices, never the whole card."""
    return {
        "id": p.get("id"),
        "name": p.get("name"),
        "price": _format_price(p.get("price")),
        "inStock": p.get("inStock", True),
        "category": p.get("category"),
    }


class RukaTools:
    """Holds the HTTP session + UI push channel and exposes the tool schemas."""

    def __init__(self, api_base: str, token: Optional[str]):
        self.api_base = api_base.rstrip("/")
        self.token = token
        self._session: Optional[aiohttp.ClientSession] = None
        # Set by the bot once the pipeline worker exists. No-op until then.
        self._push_ui: PushUI = self._noop_push

    # -- lifecycle ---------------------------------------------------------
    def set_push_ui(self, push_ui: PushUI) -> None:
        self._push_ui = push_ui

    async def _noop_push(self, _data: dict) -> None:  # pragma: no cover
        return None

    async def _ensure_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def aclose(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    # -- transport ---------------------------------------------------------
    async def _call(self, tool: str, args: dict) -> dict:
        session = await self._ensure_session()
        headers = {"content-type": "application/json"}
        if self.token:
            headers["x-voice-token"] = self.token
        url = f"{self.api_base}/api/voice-tools"
        try:
            async with session.post(
                url,
                json={"tool": tool, "args": args},
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=25),
            ) as resp:
                data = await resp.json()
                if not isinstance(data, dict):
                    return {"ok": False, "error": "Unexpected response from catalogue."}
                return data
        except asyncio.TimeoutError:
            logger.warning(f"voice-tool '{tool}' timed out")
            return {"ok": False, "error": "The catalogue took too long to respond."}
        except Exception as exc:  # noqa: BLE001 — surface a speakable error
            logger.exception(f"voice-tool '{tool}' failed: {exc}")
            return {"ok": False, "error": "I couldn't reach the catalogue just now."}

    async def _push(self, data: dict) -> None:
        try:
            await self._push_ui(data)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"failed to push UI message: {exc}")

    # -- handlers ----------------------------------------------------------
    async def search_gifts(self, params: FunctionCallParams) -> None:
        args = params.arguments or {}
        res = await self._call(
            "search_gifts",
            {
                "query": args.get("query"),
                "occasionId": args.get("occasion"),
                "minPrice": args.get("min_price"),
                "maxPrice": args.get("max_price"),
                "inStockOnly": args.get("in_stock_only", True),
            },
        )
        if not res.get("ok"):
            await params.result_callback({"error": res.get("error", "No results.")})
            return

        products = res.get("products", []) or []
        occasion = res.get("occasion")
        title = (occasion or {}).get("label") if occasion else (args.get("query") or "Gift ideas")

        await self._push(
            {
                "type": "products",
                "title": title,
                "products": products,
                "note": res.get("note"),
                "source": res.get("source"),
                "occasion": occasion,
            }
        )

        await params.result_callback(
            {
                "count": len(products),
                "items": [_slim_product(p) for p in products[:6]],
                "source": res.get("source"),
                "note": res.get("note"),
                "shown_on_screen": True,
            }
        )

    async def get_gift_details(self, params: FunctionCallParams) -> None:
        args = params.arguments or {}
        product_id = str(args.get("product_id") or "")
        if not product_id:
            await params.result_callback({"error": "I need the product id."})
            return
        res = await self._call("get_gift_details", {"productId": product_id})
        if not res.get("ok"):
            await params.result_callback({"error": res.get("error", "Couldn't find it.")})
            return

        product = res.get("product") or {}
        card = res.get("card") or product
        await self._push({"type": "open_product", "productId": product_id, "product": card})

        await params.result_callback(
            {
                "id": product.get("id"),
                "name": product.get("name"),
                "price": _format_price(product.get("price")),
                "inStock": product.get("inStock", True),
                "blurb": product.get("blurb"),
                "isCake": product.get("isCake", False),
                "shown_on_screen": True,
            }
        )

    async def add_to_cart(self, params: FunctionCallParams) -> None:
        args = params.arguments or {}
        product_id = str(args.get("product_id") or "")
        quantity = int(args.get("quantity") or 1)
        if not product_id:
            await params.result_callback({"error": "I need the product id to add it."})
            return
        # Fetch the full card so the browser cart has everything it needs.
        res = await self._call("get_gift_details", {"productId": product_id})
        if not res.get("ok"):
            await params.result_callback({"error": res.get("error", "Couldn't add that.")})
            return
        card = res.get("card") or res.get("product") or {}
        await self._push({"type": "add_to_cart", "product": card, "quantity": quantity})
        await params.result_callback(
            {
                "added": True,
                "name": card.get("name"),
                "quantity": quantity,
                "shown_on_screen": True,
            }
        )

    async def open_checkout(self, params: FunctionCallParams) -> None:
        await self._push({"type": "open_checkout"})
        await params.result_callback(
            {
                "opened": True,
                "note": "Checkout panel is open on screen; the caller enters delivery details and pays there.",
            }
        )

    async def find_delivery_cities(self, params: FunctionCallParams) -> None:
        args = params.arguments or {}
        query = str(args.get("query") or "")
        res = await self._call("find_delivery_cities", {"query": query})
        if not res.get("ok"):
            await params.result_callback({"error": res.get("error", "Couldn't look that up.")})
            return
        cities = res.get("cities", []) or []
        await params.result_callback(
            {
                "matches": [c.get("name") for c in cities[:8]],
                "serviceable": len(cities) > 0,
            }
        )

    async def check_delivery(self, params: FunctionCallParams) -> None:
        args = params.arguments or {}
        res = await self._call(
            "check_delivery",
            {
                "city": str(args.get("city") or ""),
                "date": str(args.get("date") or ""),
                "productId": args.get("product_id"),
            },
        )
        if not res.get("ok"):
            await params.result_callback({"error": res.get("error", "Couldn't check delivery.")})
            return
        quote = res.get("quote") or {}
        await self._push({"type": "delivery_quote", "quote": quote})
        await params.result_callback(
            {
                "available": quote.get("available", False),
                "fee": _format_price(
                    {"amount": quote.get("rate"), "currency": quote.get("currency", "LKR")}
                ),
                "perishableWarning": quote.get("perishableWarning"),
                "city": quote.get("city"),
                "date": quote.get("date"),
            }
        )

    async def track_order(self, params: FunctionCallParams) -> None:
        args = params.arguments or {}
        order_number = str(args.get("order_number") or "")
        res = await self._call("track_order", {"orderNumber": order_number})
        if not res.get("ok"):
            await params.result_callback({"error": res.get("error", "Couldn't find that order.")})
            return
        order = res.get("order") or {}
        await self._push({"type": "track_order", "order": order})
        await params.result_callback(
            {
                "orderNumber": order.get("orderNumber"),
                "status": order.get("statusDisplay") or order.get("status"),
                "deliveryDate": order.get("deliveryDate"),
                "shown_on_screen": True,
            }
        )

    async def show_gift_finder(self, params: FunctionCallParams) -> None:
        await self._push({"type": "show_gift_finder"})
        await params.result_callback(
            {
                "shown": True,
                "note": "Category picker is on screen — caller can tap categories and optional budget.",
            }
        )

    # -- schemas -----------------------------------------------------------
    @property
    def schemas(self) -> list[FunctionSchema]:
        return [
            FunctionSchema(
                name="search_gifts",
                description=(
                    "Find gift products. Shows image cards on the caller's screen. "
                    "Prefer passing an 'occasion' when you know it for the most reliable results."
                ),
                properties={
                    "query": {
                        "type": "string",
                        "description": "Free-text gift idea, e.g. 'chocolate hamper for mum'. Optional.",
                    },
                    "occasion": {
                        "type": "string",
                        "enum": [
                            "birthday",
                            "anniversary",
                            "romance",
                            "wedding",
                            "mother",
                            "father",
                            "newborn",
                            "sympathy",
                            "corporate",
                            "cakes",
                            "flowers",
                            "chocolates",
                            "perfumes",
                            "fruit",
                            "jewellery",
                            "toys",
                        ],
                        "description": "Curated occasion/category. Most reliable filter. Optional.",
                    },
                    "min_price": {"type": "number", "description": "Minimum price in LKR. Optional."},
                    "max_price": {"type": "number", "description": "Maximum price in LKR. Optional."},
                    "in_stock_only": {
                        "type": "boolean",
                        "description": "Only show in-stock items. Defaults true.",
                    },
                },
                required=[],
                handler=self.search_gifts,
            ),
            FunctionSchema(
                name="get_gift_details",
                description="Get full details for one product by id and open it on the caller's screen.",
                properties={"product_id": {"type": "string", "description": "The product id."}},
                required=["product_id"],
                handler=self.get_gift_details,
            ),
            FunctionSchema(
                name="add_to_cart",
                description="Add a product to the caller's cart by id.",
                properties={
                    "product_id": {"type": "string", "description": "The product id to add."},
                    "quantity": {"type": "integer", "description": "How many. Defaults 1."},
                },
                required=["product_id"],
                handler=self.add_to_cart,
            ),
            FunctionSchema(
                name="open_checkout",
                description=(
                    "Open the secure checkout panel on screen so the caller can enter delivery "
                    "details and pay. Use only after there is at least one item in the cart."
                ),
                properties={},
                required=[],
                handler=self.open_checkout,
            ),
            FunctionSchema(
                name="find_delivery_cities",
                description="Check whether a Sri Lankan city is serviceable / look up its name.",
                properties={"query": {"type": "string", "description": "City name or partial name."}},
                required=["query"],
                handler=self.find_delivery_cities,
            ),
            FunctionSchema(
                name="check_delivery",
                description="Get real delivery availability, the flat LKR fee, and any perishable warning.",
                properties={
                    "city": {"type": "string", "description": "Destination city in Sri Lanka."},
                    "date": {"type": "string", "description": "Delivery date as YYYY-MM-DD."},
                    "product_id": {
                        "type": "string",
                        "description": "Optional product id for perishable checks.",
                    },
                },
                required=["city", "date"],
                handler=self.check_delivery,
            ),
            FunctionSchema(
                name="track_order",
                description="Look up an existing Kapruka order by its order number.",
                properties={"order_number": {"type": "string", "description": "The Kapruka order number."}},
                required=["order_number"],
                handler=self.track_order,
            ),
            FunctionSchema(
                name="show_gift_finder",
                description=(
                    "Show the Kapruka category picker on screen when the caller is stuck — "
                    "e.g. they say they don't know what to get, no idea, you pick. "
                    "Do NOT call on the first turn or before they've expressed uncertainty."
                ),
                properties={},
                required=[],
                handler=self.show_gift_finder,
            ),
        ]
