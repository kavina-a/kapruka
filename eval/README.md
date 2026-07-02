# ChatRuka prompt evaluation

Offline regression tests for the gift-concierge system prompt. Runs against the **same OpenAI model and `buildSystemPrompt()` path as production** (`lib/agent/persona.ts` + `docs/prompt-chat.json`), with stubbed Kapruka tool responses so no live MCP backend is needed.

## Quick start

```bash
npm run eval:chat                  # all 24 scenarios
npm run eval:chat:verbose          # show full responses on failures
npm run eval:chat -- --scenario S9_chain_add_to_cart
npm run eval:chat -- --category cart
```

Requires `OPENAI_API_KEY` in `.env` (uses `OPENAI_MODEL`, default `gpt-4o`).

## Files

| File | Purpose |
|------|---------|
| `scenarios.json` | 24 test cases with turns + grader expectations |
| `run.ts` | Runner — calls OpenAI, collects tool calls, grades |
| `placeholders.ts` | Resolves `[PLACEHOLDER]` assistant turns in chain tests |
| `stubs.ts` | Mock tool responses (search, cart, delivery, track) |
| `grade.ts` | Pass/fail checks (`must_contain`, `tool_called`, etc.) |
| `report.json` | Written after each run (gitignored) |

## Chain scenarios

Multi-turn tests use `[PLACEHOLDER]` for prior assistant replies. `placeholders.ts` injects realistic stubs (e.g. tulip search → pink rose alternatives) so the final turn has proper context.

Scenarios sharing a `session_id` are grouped for documentation only; each scenario is self-contained with its full `turns` array.

## Grader checks

- `must_contain_any` / `must_not_contain` — substring checks on final reply
- `tool_called` / `tool_called_any` / `tool_not_called`
- `tool_params_contain` — e.g. `{ "occasionId": "cakes", "maxPrice": 3000 }`
- `must_contain_cross_sell` + `cross_sell_signals`
- `must_contain_bridge` + `bridge_signals` — mode-switch continuity

## Latest baseline (gpt-4o)

**18 / 24 passed (75%)** — see `report.json` after running.

Common failure themes (prompt tuning, not harness bugs):

| Scenario | Issue |
|----------|-------|
| S1 | Searches immediately without clarifying question |
| S2 | Surfaces products without Rs/LKR in text |
| S10 | Asks permission to search instead of calling `searchGifts` |
| S16 | Asks clarifying questions instead of searching within budget |
| S24 | Sympathy flow lacks condolences; search results include chocolates |

## Export system prompt (optional)

```bash
npx tsx eval/export-prompt.ts > eval/system_prompt.txt
```
