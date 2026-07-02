# Competitive landscape & the lessons we applied

A synthesis of patterns from leading conversational-commerce and agentic-checkout efforts, and exactly how each shaped Ruka. The goal was not to copy features but to take the single best lesson from each and execute it well.

## Persona — Levi's "Ask Indigo"

**Lesson:** a shopping agent with a _specific point of view_ outperforms a neutral "How can I help you today?" assistant. Personality drives trust and decisiveness.

**Applied:** Ruka has taste and opinions, gently steers away from lazy gifts, and always narrows to a recommendation _with a reason_. The system prompt bans filler openers and bakes in behavioural rules (show a card before describing; at most one clarifying question; never bluff). See `lib/agent/persona.ts`.

## Live-narrowing browse — Daydream

**Lesson:** users want to keep browsing while the agent works; a results surface that narrows _live_ as the conversation refines beats a static list.

**Applied:** the dual-zone layout — chat on one side, a persistent, independently-scrollable grid on the other. Both read the same active-set store, so the grid updates to mirror the latest recommendation while the user scrolls freely. See `components/products/BrowseGrid.tsx` + `components/chat/ChatContext.tsx`.

## Curated discovery — Macy's

**Lesson:** "curated discovery, not a search list." Shoppers convert better when guided to a confident pick than when handed raw search results.

**Applied:** discovery is anchored on curated occasions; Ruka shows a tight carousel (3–8 cards) and names a top pick. This doubles as our reliability strategy, since occasion+category search is far more dependable than bare keywords.

## Inline product cards — OpenAI Apps SDK

**Lesson:** inline carousels should be scannable — image + short title + 2–3 metadata lines + an optional badge + one CTA, ~3–8 cards.

**Applied:** `ProductCarousel`/`ProductCard` follow this spec: image, name, price, a stock/"Top pick" badge, and a single Add CTA, capped at 8 cards.

## Trust & honesty — Klarna

**Lesson:** a confident wrong answer about money, stock, or delivery is a trust failure. Agents must be honest about uncertainty.

**Applied:** the model only ever states tool-returned facts; the money path is removed from the LLM entirely. Stock/price is re-validated before checkout, delivery fees come only from `check_delivery`, and every failure has a visible, graceful state instead of a silent bluff.

## Verifiable checkout — Google's three-mandate model

**Lesson:** separate "intent", "cart", and "payment" into distinct, verifiable steps so intent never silently becomes a charge.

**Applied:** the checkout state machine (`review → delivery → confirm → creating → payment → done`) with an explicit confirm-before-charge checkpoint and stock/price re-validation at the cart step. See `components/checkout/CheckoutDrawer.tsx`.

## Agent frames, trusted rail executes — OpenAI / Agentic Commerce Protocol

**Lesson:** the agent should _frame_ the purchase while a trusted payment rail _executes_ it — keeping card capture and PCI scope with the merchant.

**Applied:** `kapruka_create_order` returns a real hosted `checkout_url` with a 60-minute price lock. Ruka takes the user right up to it and hands off to Kapruka's secure page. No Stripe, no card data touches this app.

---

### Net positioning

Most demos do one of these well. Ruka's bet is to combine a strong persona (Levi's) + live-narrowing dual-zone browse (Daydream) + curated discovery (Macy's) + honest, deterministic, verifiable checkout (Klarna + Google + OpenAI/ACP) on top of a brittle real API — and to make that combination _actually complete an order_ without dead ends.
