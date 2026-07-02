import type { Scenario, GradeCheck } from "./types";

export function gradeResponse(
  scenario: Scenario,
  response: string,
  toolCalls: string[],
  toolInputs: Record<string, Record<string, unknown>>,
): GradeCheck[] {
  const checks: GradeCheck[] = [];
  const lower = response.toLowerCase();
  const { expect } = scenario;

  if (expect.must_contain_any) {
    const found = expect.must_contain_any.find((phrase) =>
      lower.includes(phrase.toLowerCase()),
    );
    checks.push({
      name: "must_contain_any",
      pass: !!found,
      detail: found
        ? `✓ Found "${found}"`
        : `✗ None of [${expect.must_contain_any.join(", ")}] found in response`,
    });
  }

  if (expect.must_not_contain) {
    const found = expect.must_not_contain.find((phrase) =>
      lower.includes(phrase.toLowerCase()),
    );
    checks.push({
      name: "must_not_contain",
      pass: !found,
      detail: found
        ? `✗ Forbidden phrase found: "${found}"`
        : "✓ No forbidden phrases found",
    });
  }

  if (expect.tool_called) {
    const called = toolCalls.includes(expect.tool_called);
    checks.push({
      name: "tool_called",
      pass: called,
      detail: called
        ? `✓ ${expect.tool_called} was called`
        : `✗ ${expect.tool_called} was NOT called (called: ${toolCalls.join(", ") || "none"})`,
    });
  }

  if (expect.tool_called_any) {
    const called = expect.tool_called_any.find((t) => toolCalls.includes(t));
    checks.push({
      name: "tool_called_any",
      pass: !!called,
      detail: called
        ? `✓ ${called} was called`
        : `✗ None of [${expect.tool_called_any.join(", ")}] were called`,
    });
  }

  if (expect.tool_not_called) {
    const notCalled = !toolCalls.includes(expect.tool_not_called);
    checks.push({
      name: "tool_not_called",
      pass: notCalled,
      detail: notCalled
        ? `✓ ${expect.tool_not_called} correctly NOT called`
        : `✗ ${expect.tool_not_called} was called but should not have been`,
    });
  }

  if (expect.tool_params_contain) {
    const candidateTools = expect.tool_called
      ? [expect.tool_called]
      : (expect.tool_called_any ?? []);
    const matchedTool = candidateTools.find((name) => toolInputs[name]);
    const input = matchedTool ? (toolInputs[matchedTool] ?? {}) : {};
    const allMatch =
      !!matchedTool &&
      Object.entries(expect.tool_params_contain).every(([key, val]) => {
        const actual = input[key];
        if (typeof val === "number") {
          return typeof actual === "number" && actual <= val;
        }
        return actual === val;
      });
    checks.push({
      name: "tool_params",
      pass: allMatch,
      detail: allMatch
        ? "✓ Tool params matched"
        : `✗ Expected params ${JSON.stringify(expect.tool_params_contain)} on ${candidateTools.join(" or ")}, got ${JSON.stringify(input)}`,
    });
  }

  if (expect.must_contain_cross_sell && expect.cross_sell_signals) {
    const found = expect.cross_sell_signals.find((s) =>
      lower.includes(s.toLowerCase()),
    );
    checks.push({
      name: "cross_sell_present",
      pass: !!found,
      detail: found
        ? `✓ Cross-sell signal found: "${found}"`
        : `✗ No cross-sell offered. Expected one of: [${expect.cross_sell_signals.join(", ")}]`,
    });
  }

  if (expect.must_contain_bridge && expect.bridge_signals) {
    const found = expect.bridge_signals.find((s) =>
      lower.includes(s.toLowerCase()),
    );
    checks.push({
      name: "mode_switch_bridge",
      pass: !!found,
      detail: found
        ? `✓ Bridge sentence found: "${found}"`
        : `✗ No bridge sentence after mode switch. Expected one of: [${expect.bridge_signals.join(", ")}]`,
    });
  }

  return checks;
}
