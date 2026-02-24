/**
 * Local payload validators for cold-start feedback before network calls.
 * These validators mirror backend DTO constraints for the most common
 * create/update entrypoints.
 */

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

function validateNodePayload(node: unknown, issues: LocalValidationIssue[], path: string): void {
  if (!validateObject(node, issues, path, true)) return;

  validateString(node["name"], issues, `${path}.name`, { required: true, minLength: 1, maxLength: 100 });
  validateString(node["title"], issues, `${path}.title`, { required: false, nullable: true, maxLength: 100 });
  validateString(node["description"], issues, `${path}.description`, { required: false, nullable: true, maxLength: 400 });
  validateString(node["node_type_name"], issues, `${path}.node_type_name`, { required: true, minLength: 1, maxLength: 100 });
  validateObject(node["input_config"], issues, `${path}.input_config`, true);

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
