/** Typed configuration for the public AI Decision and AI Switch workflow actions. */
export type AiDecisionNodeType =
  | "ai_decision"
  | "typesafe_ai_decision"
  | "agenticflow_ai_decision";
export type AiSwitchNodeType =
  | "ai_switch"
  | "typesafe_ai_switch"
  | "agenticflow_ai_switch";

export type AiDecisionValue = string | Record<string, unknown> | unknown[];
export type AiDecisionScalar = AiDecisionValue | null;
export type AiDecisionQuestion =
  | { type: "choice"; instructions: AiDecisionValue; criteria: Record<string, AiDecisionScalar> }
  | { type: "score"; instructions: AiDecisionValue; criteria: AiDecisionValue[] }
  | { type: "noul"; instructions: AiDecisionValue; criteria?: { true?: AiDecisionValue; false?: AiDecisionValue } | null };

export interface AiDecisionInputConfig extends Record<string, unknown> {
  state: string | Record<string, unknown> | unknown[];
  questions: Record<string, AiDecisionQuestion>;
  model?: "jev-1.13.0" | string;
  schema_version?: 1;
  billing_mode?: "pixelml" | "byok" | "agenticflow";
  max_input_tokens?: number | null;
  max_run_credits?: number | null;
  max_calls?: number;
  on_budget_exceeded?: "error" | "skip";
}

/** Inline workflows use the same snake_case node DTOs as workflow create. */
export interface AiSwitchInlineWorkflow extends Record<string, unknown> {
  nodes: Array<Record<string, unknown>>;
  output_mapping: Record<string, string>;
}

export interface AiSwitchDestination extends Record<string, unknown> {
  workflow_id?: string | null;
  inline_workflow?: AiSwitchInlineWorkflow | null;
  input_mapping?: Record<string, unknown>;
  output_mapping?: Record<string, string>;
}

export interface AiSwitchBranch extends AiSwitchDestination {
  id: string;
  label?: string;
  option_id?: string;
  question_id: string;
  threshold?: number | null;
  operator?: "gte" | "gt" | "lte" | "lt";
  min_confidence?: number | null;
}

export type AiSwitchFallback = {
  id?: "fallback";
  action: "workflow" | "skip";
  destination?: AiSwitchDestination | null;
  /** @deprecated Use `destination.workflow_id`; retained for older blueprints. */
  workflow_id?: string | null;
  /** @deprecated Use `destination.inline_workflow`; retained for older blueprints. */
  inline_workflow?: AiSwitchInlineWorkflow | null;
  /** @deprecated Use `destination.input_mapping`; retained for older blueprints. */
  input_mapping?: Record<string, unknown>;
  /** @deprecated Use `destination.output_mapping`; retained for older blueprints. */
  output_mapping?: Record<string, string>;
};

export interface AiSwitchInputConfig extends Record<string, unknown> {
  mode: "best_match" | "ordered_conditions" | "score_threshold";
  decision_source: "embedded" | "existing";
  /** Required by the live DTO even when decision_source is existing. */
  decision_config: AiDecisionInputConfig;
  existing_decision?: Record<string, unknown> | string | null;
  branches: AiSwitchBranch[];
  fallback: AiSwitchFallback;
  timeout_seconds?: number;
  schema_version?: 1;
  common_output_schema?: Record<string, unknown>;
}

export type WorkflowInputConfig<T extends string> = T extends AiDecisionNodeType
  ? AiDecisionInputConfig
  : T extends AiSwitchNodeType
    ? AiSwitchInputConfig
    : Record<string, unknown>;

export function isAiDecisionNode(nodeType: string): nodeType is AiDecisionNodeType {
  return ["ai_decision", "typesafe_ai_decision", "agenticflow_ai_decision"].includes(nodeType);
}

export function isAiSwitchNode(nodeType: string): nodeType is AiSwitchNodeType {
  return ["ai_switch", "typesafe_ai_switch", "agenticflow_ai_switch"].includes(nodeType);
}
