# First-hand findings: the Kapruka MCP

Notes from probing `https://mcp.kapruka.com/mcp` directly (Streamable HTTP, public, no auth) before and during the build. These drove several architecture decisions.

## Tools

`kapruka_search_products`, `kapruka_get_product`, `kapruka_list_categories`, `kapruka_list_delivery_cities`, `kapruka_check_delivery`, `kapruka_create_order`, `kapruka_track_order`. Every tool wraps its arguments under a single `params` object. Most reads accept `response_format: "json"`.

## Reliability (the big one)

`search_products` is **intermittent**. Observed directly:

- One evening: `q:"chocolate"` and `q:"perfume"` returned products.
- Next morning: the _same_ queries returned `"No products found"` repeatedly, across many retries — yet `get_product`, categories, cities, delivery, and order creation all kept working perfectly.
- Failures are **masked as empty results** (`isError: false`, `"No products found for '…'"`), not surfaced as errors.

Other search observations:

- **Category pairing helps.** `q:"chocolate" + category:"Chocolates"` succeeded when bare `q:"chocolate"` failed. Using the occasion/category name as the query (e.g. `q:"birthday" + category:"birthday"`) is the most reliable pattern.
- Bare singular keywords (`cake`, `flower`) are weak matches; `include_stubs:true` surfaces `CATSYM…` category-stub pseudo-products that must be filtered out.

**Decision:** never depend on live search for a guaranteed demo. Anchor discovery on curated occasions, try resilient query/category combinations, and fall back to a verified seed catalogue.

## Verified-reliable tools & shapes

- `get_product` (LKR): `{ id, name, description, summary, price{amount,currency}, compare_at_price, in_stock, stock_level, category{…}, variants[…], images[], attributes{type,subtype,weight,vendor}, shipping{…}, url }`. Accepts both web-style ids (`chocolates00299`) and API ids (`EF_PC_CHOC0V571POD00076`).
- `check_delivery` (json): `{ city, now, checked_date, available, rate, currency, perishable_warning }`. Flat LKR `rate` per city/date; `perishable_warning` populated when a cake/flower `product_id` is passed.
- `list_delivery_cities`: markdown bullets — `- **Colombo 03**  _aliases: Kolpity colpity colombo3_` — parsed into `{ name, aliases[] }`.
- `create_order` (json): returns `{ summary{items_total,delivery_fee,addons_total,grand_total,currency}, checkout_url, expires_at, order_ref }`. Verified live: a real order produced `checkout_url = https://www.kapruka.com/tools/continue_order.jsp?id=…` with a ~60-minute `expires_at`. Input is `cart[{product_id,quantity,icing_text?}]`, `recipient{name,phone}`, `delivery{address,city,location_type,date,instructions?}`, `sender{name,anonymous}`, `gift_message?`, `currency`.

## Data hygiene

Summaries arrive as tag-soup with mangled HTML entities: `specialGifts - Chocolate, Valentine, Kpc, Kpcondemand, …`, `n#160;` (→ nbsp), `namp;` (→ &), backtick apostrophes. The normalizer decodes these, strips junk tokens, and prefers the cleaner `get_product.description` for detail views. Cards lead with name + price + stock to avoid surfacing noise.

## Rate limits

~60 requests/min and ~30 orders/hr per IP (all proxied calls share the server IP). Read calls are cached in-memory; retries use exponential backoff and detect 429s.

## Seed catalogue harvest

Kapruka's public category pages (`kapruka.com/online/<slug>`) embed schema.org `Product` JSON-LD with name, image, and the product id in the URL — fully independent of MCP search. `scripts/harvest-catalog.mjs` scrapes ids per occasion and enriches each via `get_product`, yielding `lib/catalog/seed.json` (90 real products across 13 verticals).
