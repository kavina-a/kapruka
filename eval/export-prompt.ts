/** Dump the live CHAT-mode system prompt to stdout (for external eval tools). */
import { buildSystemPrompt } from "../lib/agent/persona";

console.log(buildSystemPrompt({}, "CHAT"));
