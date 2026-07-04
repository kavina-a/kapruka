export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export interface Expectation {
  must_contain_any?: string[];
  must_not_contain?: string[];
  must_contain_bridge?: boolean;
  bridge_signals?: string[];
  must_contain_cross_sell?: boolean;
  cross_sell_signals?: string[];
  tool_called?: string;
  tool_called_any?: string[];
  tool_not_called?: string;
  tool_params_contain?: Record<string, unknown>;
  /** Fails if any of these key/value pairs DOES match the actual tool input (e.g. occasionId must never be 'father'). */
  tool_params_not_contain?: Record<string, unknown>;
  tone_signals?: string[];
  notes?: string;
}

export interface Scenario {
  id: string;
  name: string;
  category: string;
  session_id: string | null;
  turns: Turn[];
  expect: Expectation;
  /** Simulates commerceContext.giftFinderState — set to true for "already completed the picker" scenarios. */
  gift_finder_already_complete?: boolean;
}

export interface GradeCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface ScenarioResult {
  id: string;
  name: string;
  category: string;
  pass: boolean;
  response: string;
  tool_calls: string[];
  grades: GradeCheck[];
  notes: string;
}
