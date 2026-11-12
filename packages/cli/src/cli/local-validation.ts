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

function isReference(value: unknown): value is string {
  return typeof value === 'string' && /^\s*\{\{(?:(?!\{\{|\}\})[\s\S])+\}\}\s*$/.test(value);
}

function validatePixelMLConfig(raw: unknown, connection: unknown, wrapped: boolean, issues: LocalValidationIssue[], path: string): void {
  if (typeof connection !== 'string' || !connection.trim() || connection.includes('{{')) addIssue(issues, `${path}.connection`, 'requires a fixed PixelML connection');
  if (!validateObject(raw, issues, `${path}.input_config`, true)) return;
  const config: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!['model', 'parameters', 'schema_hash'].includes(key)) addIssue(issues, `${path}.input_config.${key}`, 'unsupported Run Tool configuration field');
    if (wrapped) {
      if (!isRecord(value) || !('value' in value)) addIssue(issues, `${path}.input_config.${key}`, 'agent fields must be wrapped in {value: ...}');
      else config[key] = value.value;
    } else config[key] = value;
  }
  if (typeof config.model !== 'string' || !config.model.trim() || config.model.includes('{{')) addIssue(issues, `${path}.input_config.model`, 'requires a fixed model ID');
  if (!isRecord(config.parameters) && !isReference(config.parameters)) addIssue(issues, `${path}.input_config.parameters`, 'must be an object or whole-value reference');
  if (config.schema_hash != null && (typeof config.schema_hash !== 'string' || config.schema_hash.includes('{{'))) addIssue(issues, `${path}.input_config.schema_hash`, 'must be a fixed schema hash');
}

function validatePixelMLPlugins(value: unknown, issues: LocalValidationIssue[]): void {
  if (!Array.isArray(value)) return;
  value.forEach((plugin, index) => {
    if (isRecord(plugin) && plugin.plugin_id === 'pml_run_tool') validatePixelMLConfig(plugin.input_config, plugin.connection, true, issues, `$.plugins[${index}]`);
  });
}

/** Keep workflow raw inputs and agent fixed wrappers distinct. */
export function pixelMLConfigureExample(detail: { id: string; schema_hash: string }, connection: string) {
  return {
    workflow: { name: 'run_tool', node_type_name: 'pml_run_tool', connection, input_config: { model: detail.id, parameters: '{{parameters}}', schema_hash: detail.schema_hash } },
    agent: { plugin_id: 'pml_run_tool', plugin_version: 'v1.0.0', connection, input_config: { model: { value: detail.id }, parameters: { value: {} }, schema_hash: { value: detail.schema_hash } } },
  };
}

interface PixelMLBuildClient {
  nodeTypes: { resolveSchema(options: { name: string; projectId?: string; connection?: string; inputConfig: Record<string, unknown> }): Promise<unknown> };
}

export function hasPixelMLTools(payload: unknown, kind: 'workflow' | 'agent'): boolean {
  if (!isRecord(payload)) return false;
  const rows = payload[kind === 'workflow' ? 'nodes' : 'plugins'];
  return Array.isArray(rows) && rows.some(row => isRecord(row) && row[kind === 'workflow' ? 'node_type_name' : 'plugin_id'] === 'pml_run_tool');
}

/** Resolve each selected model, preserve expressions, and pin the reviewed schema hash.
 * Local checks cover known literal types; full JSON Schema validation follows reference resolution on the server.
 */
export async function preparePixelMLBuild(client: PixelMLBuildClient, raw: unknown, kind: 'workflow' | 'agent') {
  if (!isRecord(raw)) throw new Error('Build payload must be an object.');
  const payload = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  const issues: LocalValidationIssue[] = [];
  const schemas: Record<string, unknown> = {};
  const key = kind === 'workflow' ? 'nodes' : 'plugins';
  const rows = payload[key];
  if (!Array.isArray(rows)) return { payload, issues, schemas };
  for (const [index, row] of rows.entries()) {
    if (!isRecord(row) || row[kind === 'workflow' ? 'node_type_name' : 'plugin_id'] !== 'pml_run_tool') continue;
    const path = `$.${key}[${index}]`;
    const before = issues.length;
    validatePixelMLConfig(row.input_config, row.connection, kind === 'agent', issues, path);
    if (issues.length !== before) continue;
    const fields = row.input_config as Record<string, unknown>;
    const input = kind === 'agent' ? Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, (v as Record<string, unknown>).value])) : fields;
    const response = await client.nodeTypes.resolveSchema({ name: 'pml_run_tool', projectId: typeof payload.project_id === 'string' ? payload.project_id : undefined, connection: row.connection as string, inputConfig: input });
    const resolved = isRecord(response) && isRecord(response.body) ? response.body : response;
    if (!isRecord(resolved) || !isRecord(resolved.input_schema) || !isRecord(resolved.output_schema) || typeof resolved.schema_hash !== 'string' || resolved.model !== input.model) throw new Error('Invalid PixelML resolved schema response.');
    schemas[path] = resolved;
    if (input.schema_hash != null && input.schema_hash !== resolved.schema_hash) {
      addIssue(issues, `${path}.input_config.schema_hash`, 'schema changed; describe the tool and review configuration before refreshing its hash');
      continue;
    }
    validatePixelMLLiterals(input, resolved.input_schema, `${path}.input_config`, issues, kind === 'agent', resolved.input_schema);
    fields.schema_hash = kind === 'agent' ? { ...(isRecord(fields.schema_hash) ? fields.schema_hash : {}), value: resolved.schema_hash } : resolved.schema_hash;
  }
  return { payload, issues, schemas };
}

function validatePixelMLLiterals(value: unknown, schema: unknown, path: string, issues: LocalValidationIssue[], partial: boolean, root: Record<string, unknown>, depth = 0): void {
  if (isReference(value) || !isRecord(schema) || depth > 64) return;
  if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/')) {
    const target = schema.$ref.slice(2).split('/').reduce<unknown>((current, token) => isRecord(current) ? current[token.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined, root);
    validatePixelMLLiterals(value, target, path, issues, partial, root, depth + 1);
  }
  if (Array.isArray(schema.allOf)) for (const branch of schema.allOf) validatePixelMLLiterals(value, branch, path, issues, partial, root, depth + 1);
  const alternatives = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(alternatives)) {
    const candidates = alternatives.map(branch => { const errors: LocalValidationIssue[] = []; validatePixelMLLiterals(value, branch, path, errors, partial, root, depth + 1); return errors; });
    if (candidates.length && candidates.every(errors => errors.length)) addIssue(issues, path, 'does not match any allowed schema type');
  }
  const types = Array.isArray(schema.type) ? schema.type : typeof schema.type === 'string' ? [schema.type] : [];
  const matches = (type: unknown) => type === 'object' ? isRecord(value) : type === 'array' ? Array.isArray(value) : type === 'null' ? value === null : type === 'integer' ? typeof value === 'number' && Number.isInteger(value) : typeof value === type;
  if (types.length && !types.some(matches)) { addIssue(issues, path, `must match schema type ${types.join(' or ')} or be a whole-value reference`); return; }
  // Interpolated strings are checked after runtime substitution.
  const templated = typeof value === 'string' && value.includes('{{');
  if (!templated && Array.isArray(schema.enum) && !schema.enum.some(item => JSON.stringify(item) === JSON.stringify(value))) addIssue(issues, path, 'must match an allowed schema value');
  if (isRecord(value)) {
    if (!partial && Array.isArray(schema.required)) for (const key of schema.required) if (typeof key === 'string' && !(key in value)) addIssue(issues, `${path}.${key}`, 'is required by the selected tool');
    for (const [key, child] of Object.entries(value)) {
      const properties = isRecord(schema.properties) ? schema.properties : {};
      if (key in properties) validatePixelMLLiterals(child, properties[key], `${path}.${key}`, issues, partial, root, depth + 1);
      else if (isRecord(schema.additionalProperties)) validatePixelMLLiterals(child, schema.additionalProperties, `${path}.${key}`, issues, partial, root, depth + 1);
      else if (schema.additionalProperties === false) addIssue(issues, `${path}.${key}`, 'is not allowed by the selected tool');
    }
  }
  if (Array.isArray(value)) value.forEach((child, index) => validatePixelMLLiterals(child, Array.isArray(schema.items) ? schema.items[index] : schema.items, `${path}[${index}]`, issues, false, root, depth + 1));
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
  if (node.node_type_name === 'pml_run_tool') validatePixelMLConfig(node.input_config, node.connection, false, issues, path);

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
  validatePixelMLPlugins(payload.plugins, issues);

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
  validatePixelMLPlugins(payload.plugins, issues);
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
