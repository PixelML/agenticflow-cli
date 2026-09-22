/**
 * Local payload validators for cold-start feedback before network calls.
 * These validators mirror backend DTO constraints for the most common
 * create/update entrypoints.
 */

import { isAiDecisionNode, isAiSwitchNode } from "./ai-node-config.js";

export interface LocalValidationIssue {
  path: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addIssue(issues: LocalValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function validateString(
  value: unknown,
  issues: LocalValidationIssue[],
  path: string,
  opts: { required?: boolean; minLength?: number; maxLength?: number; nullable?: boolean } = {},
): void {
  const required = opts.required ?? false;
  const minLength = opts.minLength ?? 0;
  const maxLength = opts.maxLength;
  const nullable = opts.nullable ?? false;

  if (value == null) {
    if (required) addIssue(issues, path, "is required");
    return;
  }
  if (nullable && value === null) return;
  if (typeof value !== "string") {
    addIssue(issues, path, "must be a string");
    return;
  }
  if (value.length < minLength) {
    addIssue(issues, path, `must be at least ${minLength} characters`);
  }
  if (maxLength != null && value.length > maxLength) {
    addIssue(issues, path, `must be <= ${maxLength} characters`);
  }
}

function validateBoolean(
  value: unknown,
  issues: LocalValidationIssue[],
  path: string,
  required = false,
): void {
  if (value == null) {
    if (required) addIssue(issues, path, "is required");
    return;
  }
  if (typeof value !== "boolean") {
    addIssue(issues, path, "must be a boolean");
  }
}

function validateNumber(
  value: unknown,
  issues: LocalValidationIssue[],
  path: string,
  opts: { required?: boolean; min?: number; max?: number; integer?: boolean } = {},
): void {
  const required = opts.required ?? false;
  if (value == null) {
    if (required) addIssue(issues, path, "is required");
    return;
  }
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    addIssue(issues, path, "must be a number");
    return;
  }
  if (opts.integer && !Number.isInteger(value)) {
    addIssue(issues, path, "must be an integer");
  }
  if (opts.min != null && value < opts.min) {
    addIssue(issues, path, `must be >= ${opts.min}`);
  }
  if (opts.max != null && value > opts.max) {
    addIssue(issues, path, `must be <= ${opts.max}`);
  }
}

function validateObject(
  value: unknown,
  issues: LocalValidationIssue[],
  path: string,
  required = false,
): value is Record<string, unknown> {
  if (value == null) {
    if (required) addIssue(issues, path, "is required");
    return false;
  }
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return false;
  }
  return true;
}

function validateStringMap(
  value: unknown,
  issues: LocalValidationIssue[],
  path: string,
  required = false,
): void {
  if (value == null) {
    if (required) addIssue(issues, path, "is required");
    return;
  }
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object");
    return;
  }
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") {
      addIssue(issues, `${path}.${key}`, "must be a string");
    }
  }
}

const AI_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
function isDecisionValue(value: unknown): boolean {
  return typeof value === "string" || Array.isArray(value) || isRecord(value);
}

function validateDecisionConfig(value: unknown, issues: LocalValidationIssue[], path: string): void {
  if (!validateObject(value, issues, path, true)) return;
  const state = value["state"];
  if (!(typeof state === "string" || Array.isArray(state) || isRecord(state))) addIssue(issues, `${path}.state`, "must be a string, object, or array");
  const questions = value["questions"];
  if (!validateObject(questions, issues, `${path}.questions`, true)) return;
  const entries = Object.entries(questions);
  if (entries.length < 1 || entries.length > 32) addIssue(issues, `${path}.questions`, "must contain 1 to 32 questions");
  for (const [questionId, rawQuestion] of entries) {
    const qPath = `${path}.questions.${questionId}`;
    if (!AI_ID_PATTERN.test(questionId)) addIssue(issues, qPath, "invalid question id");
    if (!validateObject(rawQuestion, issues, qPath, true)) continue;
    if (!isDecisionValue(rawQuestion["instructions"])) {
      addIssue(issues, `${qPath}.instructions`, "must be a non-null string, object, or array");
    }
    const type = rawQuestion["type"];
    if (type !== "choice" && type !== "score" && type !== "noul") { addIssue(issues, `${qPath}.type`, "must be choice, score, or noul"); continue; }
    const criteria = rawQuestion["criteria"];
    if (type === "choice") {
      if (!validateObject(criteria, issues, `${qPath}.criteria`, true)) continue;
      const options = Object.entries(criteria);
      if (options.length < 2 || options.length > 255) addIssue(issues, `${qPath}.criteria`, "must contain 2 to 255 options");
      for (const [optionId, option] of options) {
        if (!AI_ID_PATTERN.test(optionId)) addIssue(issues, `${qPath}.criteria.${optionId}`, "invalid option id");
        if (option !== null && !isDecisionValue(option)) addIssue(issues, `${qPath}.criteria.${optionId}`, "must be a string, object, array, or null");
      }
    } else if (type === "score") {
      if (!Array.isArray(criteria)) addIssue(issues, `${qPath}.criteria`, "must be an array");
      else {
        if (criteria.length < 2 || criteria.length > 10) addIssue(issues, `${qPath}.criteria`, "must contain 2 to 10 levels");
        criteria.forEach((item, index) => { if (!isDecisionValue(item) || item === null) addIssue(issues, `${qPath}.criteria[${index}]`, "must be a string, object, or array"); });
      }
    } else if (criteria != null) {
      if (!isRecord(criteria)) addIssue(issues, `${qPath}.criteria`, "must be null or an object");
      else {
        for (const [key, item] of Object.entries(criteria)) {
          if (key !== "true" && key !== "false") addIssue(issues, `${qPath}.criteria.${key}`, "must be true or false");
          if (!isDecisionValue(item)) addIssue(issues, `${qPath}.criteria.${key}`, "must be a string, object, or array");
        }
      }
    }
  }
  if (value["schema_version"] != null && value["schema_version"] !== 1) addIssue(issues, `${path}.schema_version`, "must be 1");
  if (value["billing_mode"] != null && !["pixelml", "byok", "agenticflow"].includes(String(value["billing_mode"]))) addIssue(issues, `${path}.billing_mode`, "invalid billing mode");
  if (value["max_input_tokens"] != null) validateNumber(value["max_input_tokens"], issues, `${path}.max_input_tokens`, { min: 1, max: 64000, integer: true });
  if (value["max_run_credits"] != null) validateNumber(value["max_run_credits"], issues, `${path}.max_run_credits`, { min: 0 });
  if (value["max_calls"] != null) validateNumber(value["max_calls"], issues, `${path}.max_calls`, { min: 1, max: 32, integer: true });
  if (value["on_budget_exceeded"] != null && value["on_budget_exceeded"] !== "error" && value["on_budget_exceeded"] !== "skip") addIssue(issues, `${path}.on_budget_exceeded`, "must be error or skip");
}

function validateNodePayload(node: unknown, issues: LocalValidationIssue[], path: string): void {
  if (!validateObject(node, issues, path, true)) return;

  validateString(node["name"], issues, `${path}.name`, { required: true, minLength: 1, maxLength: 100 });
  validateString(node["title"], issues, `${path}.title`, { required: false, nullable: true, maxLength: 100 });
  validateString(node["description"], issues, `${path}.description`, { required: false, nullable: true, maxLength: 400 });
  validateString(node["node_type_name"], issues, `${path}.node_type_name`, { required: true, minLength: 1, maxLength: 100 });
  validateObject(node["input_config"], issues, `${path}.input_config`, true);
  if (isRecord(node["input_config"])) {
    validateAiNodeInput(String(node["node_type_name"] ?? ""), node["input_config"] as Record<string, unknown>, issues, `${path}.input_config`);
  }

  if (node["output_mapping"] != null) {
    validateStringMap(node["output_mapping"], issues, `${path}.output_mapping`, false);
  }

  if (node["connection"] != null && typeof node["connection"] !== "string") {
    addIssue(issues, `${path}.connection`, "must be a string or null");
  }
}

function validateNodesArray(value: unknown, issues: LocalValidationIssue[], path: string): void {
  if (!Array.isArray(value)) {
    addIssue(issues, path, "must be an array");
    return;
  }
  if (value.length < 1) {
    addIssue(issues, path, "must contain at least one node");
  }
  if (value.length > 100) {
    addIssue(issues, path, "must contain at most 100 nodes");
  }
  value.forEach((node, index) => validateNodePayload(node, issues, `${path}[${index}]`));
}

export function validateWorkflowCreatePayload(payload: unknown): LocalValidationIssue[] {
  const issues: LocalValidationIssue[] = [];
  if (!validateObject(payload, issues, "$", true)) return issues;

  validateString(payload["name"], issues, "$.name", { required: true, minLength: 1, maxLength: 100 });
  validateString(payload["description"], issues, "$.description", { required: false, nullable: true, maxLength: 400 });
  validateNodesArray(payload["nodes"], issues, "$.nodes");
  validateStringMap(payload["output_mapping"], issues, "$.output_mapping", true);
  validateObject(payload["input_schema"], issues, "$.input_schema", true);
  validateString(payload["project_id"], issues, "$.project_id", { required: true, minLength: 1 });

  if (payload["workflow_metadata"] != null) {
    validateObject(payload["workflow_metadata"], issues, "$.workflow_metadata");
  }
  return issues;
}

export function validateWorkflowUpdatePayload(payload: unknown): LocalValidationIssue[] {
  const issues: LocalValidationIssue[] = [];
  if (!validateObject(payload, issues, "$", true)) return issues;

  validateString(payload["name"], issues, "$.name", { required: true, minLength: 1, maxLength: 100 });
  validateString(payload["description"], issues, "$.description", { required: false, nullable: true, maxLength: 400 });
  validateNodesArray(payload["nodes"], issues, "$.nodes");
  validateStringMap(payload["output_mapping"], issues, "$.output_mapping", true);
  validateObject(payload["input_schema"], issues, "$.input_schema", true);
  validateBoolean(payload["public_runnable"], issues, "$.public_runnable", true);

  if (payload["public_clone"] != null) {
    validateBoolean(payload["public_clone"], issues, "$.public_clone");
  }
  if (payload["images"] != null) {
    if (!Array.isArray(payload["images"])) {
      addIssue(issues, "$.images", "must be an array of strings");
    } else {
      payload["images"].forEach((item, index) => {
        if (typeof item !== "string") addIssue(issues, `$.images[${index}]`, "must be a string");
      });
    }
  }
  if (payload["dataset_id"] != null && typeof payload["dataset_id"] !== "string") {
    addIssue(issues, "$.dataset_id", "must be a string or null");
  }
  if (payload["workflow_metadata"] != null) {
    validateObject(payload["workflow_metadata"], issues, "$.workflow_metadata");
  }

  return issues;
}

function validateToolConfig(value: unknown, issues: LocalValidationIssue[], path: string): void {
  if (!validateObject(value, issues, path, true)) return;

  if (value["workflow_id"] != null && typeof value["workflow_id"] !== "string") {
    addIssue(issues, `${path}.workflow_id`, "must be a string or null");
  }
  if (value["workflow_template_id"] != null && typeof value["workflow_template_id"] !== "string") {
    addIssue(issues, `${path}.workflow_template_id`, "must be a string or null");
  }
  if (value["description"] != null && typeof value["description"] !== "string") {
    addIssue(issues, `${path}.description`, "must be a string or null");
  }
  if (value["run_behavior"] != null) {
    if (value["run_behavior"] !== "auto_run" && value["run_behavior"] !== "request_confirmation") {
      addIssue(issues, `${path}.run_behavior`, "must be 'auto_run' or 'request_confirmation'");
    }
  }
  if (value["timeout"] != null) {
    validateNumber(value["timeout"], issues, `${path}.timeout`, { min: 1, max: 300, integer: true });
  }
  if (value["input_config"] != null && !isRecord(value["input_config"])) {
    addIssue(issues, `${path}.input_config`, "must be an object or null");
  }
}

function validateToolsArray(value: unknown, issues: LocalValidationIssue[], path: string, required = false): void {
  if (value == null) {
    if (required) addIssue(issues, path, "is required");
    return;
  }
  if (!Array.isArray(value)) {
    addIssue(issues, path, "must be an array");
    return;
  }
  value.forEach((tool, index) => validateToolConfig(tool, issues, `${path}[${index}]`));
}

export function validateAgentCreatePayload(payload: unknown): LocalValidationIssue[] {
  const issues: LocalValidationIssue[] = [];
  if (!validateObject(payload, issues, "$", true)) return issues;

  validateString(payload["name"], issues, "$.name", { required: true, minLength: 1 });
  validateString(payload["project_id"], issues, "$.project_id", { required: true, minLength: 1 });
  validateToolsArray(payload["tools"], issues, "$.tools", true);

  if (payload["visibility"] != null) {
    const visibility = payload["visibility"];
    if (
      visibility !== "private" &&
      visibility !== "public" &&
      visibility !== "public_visible"
    ) {
      addIssue(issues, "$.visibility", "must be 'private', 'public', or 'public_visible'");
    }
  }

  if (payload["recursion_limit"] != null) {
    validateNumber(payload["recursion_limit"], issues, "$.recursion_limit", {
      min: 10,
      max: 500,
      integer: true,
    });
  }

  return issues;
}

export function validateAgentUpdatePayload(payload: unknown): LocalValidationIssue[] {
  const issues: LocalValidationIssue[] = [];
  if (!validateObject(payload, issues, "$", true)) return issues;

  if (Object.keys(payload).length === 0) {
    addIssue(issues, "$", "must contain at least one field to update");
    return issues;
  }

  if (payload["name"] != null) validateString(payload["name"], issues, "$.name", { minLength: 1 });
  if (payload["description"] != null && typeof payload["description"] !== "string") {
    addIssue(issues, "$.description", "must be a string or null");
  }
  if (payload["tools"] != null) validateToolsArray(payload["tools"], issues, "$.tools");
  if (payload["recursion_limit"] != null) {
    validateNumber(payload["recursion_limit"], issues, "$.recursion_limit", {
      min: 10,
      max: 500,
      integer: true,
    });
  }
  if (payload["visibility"] != null) {
    const visibility = payload["visibility"];
    if (
      visibility !== "private" &&
      visibility !== "public" &&
      visibility !== "public_visible"
    ) {
      addIssue(issues, "$.visibility", "must be 'private', 'public', or 'public_visible'");
    }
  }

  return issues;
}

export function validateWorkflowRunPayload(payload: unknown): LocalValidationIssue[] {
  const issues: LocalValidationIssue[] = [];
  if (!validateObject(payload, issues, "$", true)) return issues;

  validateString(payload["workflow_id"], issues, "$.workflow_id", { required: true, minLength: 1 });
  if (payload["input"] != null && !isRecord(payload["input"])) {
    addIssue(issues, "$.input", "must be an object when provided");
  }

  return issues;
}

export function validateAgentStreamPayload(payload: unknown): LocalValidationIssue[] {
  const issues: LocalValidationIssue[] = [];
  if (!validateObject(payload, issues, "$", true)) return issues;

  const messages = payload["messages"];
  if (!Array.isArray(messages)) {
    addIssue(issues, "$.messages", "must be an array");
    return issues;
  }
  if (messages.length < 1) {
    addIssue(issues, "$.messages", "must contain at least one message");
    return issues;
  }

  messages.forEach((message, index) => {
    const basePath = `$.messages[${index}]`;
    if (!validateObject(message, issues, basePath, true)) return;
    validateString(message["content"], issues, `${basePath}.content`, { required: true, minLength: 1 });
    if (message["role"] != null && typeof message["role"] !== "string") {
      addIssue(issues, `${basePath}.role`, "must be a string");
    }
  });

  if (payload["id"] != null && typeof payload["id"] !== "string") {
    addIssue(issues, "$.id", "must be a string when provided");
  }

  return issues;
}
function validateInlineWorkflow(value: unknown, issues: LocalValidationIssue[], path: string): void {
  if (!validateObject(value, issues, path, true)) return;
  validateNodesArray(value["nodes"], issues, path + ".nodes");
  validateStringMap(value["output_mapping"], issues, path + ".output_mapping", true);
}

function validateDestination(value: unknown, issues: LocalValidationIssue[], path: string, required: boolean): void {
  if (!validateObject(value, issues, path, required)) return;
  if (value["workflow_id"] != null) validateString(value["workflow_id"], issues, path + ".workflow_id", { minLength: 1 });
  if (value["inline_workflow"] != null) validateInlineWorkflow(value["inline_workflow"], issues, path + ".inline_workflow");
  if (required && value["workflow_id"] == null && value["inline_workflow"] == null) addIssue(issues, path, "must include workflow_id or inline_workflow");
  if (value["input_mapping"] != null && !isRecord(value["input_mapping"])) addIssue(issues, path + ".input_mapping", "must be an object");
  if (value["output_mapping"] != null) validateStringMap(value["output_mapping"], issues, path + ".output_mapping");
}

function validateFallback(value: unknown, issues: LocalValidationIssue[], path: string): void {
  if (!validateObject(value, issues, path, true)) return;
  if (value["id"] != null && value["id"] !== "fallback") addIssue(issues, path + ".id", "must be fallback");
  if (value["action"] !== "skip" && value["action"] !== "workflow") {
    addIssue(issues, path + ".action", "must be skip or workflow");
    return;
  }
  if (value["destination"] != null) validateDestination(value["destination"], issues, path + ".destination", value["action"] === "workflow");
  // Older checked-in blueprints used destination fields directly on fallback.
  // Continue validating that shape while the registry migrates to the live DTO.
  const legacyDestinationKeys = ["workflow_id", "inline_workflow", "input_mapping", "output_mapping"];
  if (value["destination"] == null && legacyDestinationKeys.some((key) => key in value)) {
    if (value["action"] === "workflow") validateDestination(value, issues, path, true);
  } else if (value["action"] === "workflow" && value["destination"] == null) {
    addIssue(issues, path + ".destination", "is required for workflow fallback");
  }
}

function validateAiNodeInput(nodeType: string, value: Record<string, unknown>, issues: LocalValidationIssue[], path: string): void {
  if (isAiDecisionNode(nodeType)) { validateDecisionConfig(value, issues, path); return; }
  if (!isAiSwitchNode(nodeType)) return;
  if (!["best_match", "ordered_conditions", "score_threshold"].includes(String(value["mode"]))) addIssue(issues, path + ".mode", "invalid switch mode");
  if (value["decision_source"] !== "embedded" && value["decision_source"] !== "existing") addIssue(issues, path + ".decision_source", "invalid decision source");
  validateDecisionConfig(value["decision_config"], issues, path + ".decision_config");
  if (!Array.isArray(value["branches"])) addIssue(issues, path + ".branches", "must be an array");
  else {
    if (value["branches"].length < 1) addIssue(issues, path + ".branches", "must contain at least one branch");
    value["branches"].forEach((rawBranch, index) => {
      const bPath = path + ".branches[" + index + "]";
      if (!validateObject(rawBranch, issues, bPath, true)) return;
      validateString(rawBranch["id"], issues, bPath + ".id", { required: true, minLength: 1, maxLength: 32 });
      if (typeof rawBranch["id"] === "string" && !AI_ID_PATTERN.test(rawBranch["id"] as string)) addIssue(issues, bPath + ".id", "invalid branch id");
      validateString(rawBranch["question_id"], issues, bPath + ".question_id", { required: true, minLength: 1, maxLength: 32 });
      if (rawBranch["threshold"] != null) validateNumber(rawBranch["threshold"], issues, bPath + ".threshold");
      if (rawBranch["operator"] != null && !["gte", "gt", "lte", "lt"].includes(String(rawBranch["operator"]))) addIssue(issues, bPath + ".operator", "invalid operator");
      if (rawBranch["min_confidence"] != null) validateNumber(rawBranch["min_confidence"], issues, bPath + ".min_confidence", { min: 0, max: 1 });
      validateDestination(rawBranch, issues, bPath, true);
    });
  }
  validateFallback(value["fallback"], issues, path + ".fallback");
  if (value["timeout_seconds"] != null) validateNumber(value["timeout_seconds"], issues, path + ".timeout_seconds", { min: 1, integer: true });
}
