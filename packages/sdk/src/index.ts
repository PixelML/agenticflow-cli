/**
 * SDK public exports.
 */

export { AgenticFlowSDK, DEFAULT_BASE_URL, AGENTICFLOW_API_KEY, WORKSPACE_ID, PROJECT_ID } from "./core.js";
export type { AgenticFlowSDKOptions } from "./core.js";
export type { APIResponse } from "./types.js";
export { fromFetchResponse } from "./types.js";
export {
  AgenticFlowError,
  NetworkError,
  RequestTimeoutError,
  APIError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServerError,
} from "./exceptions.js";
export {
  AgentsResource,
  WorkflowsResource,
  ConnectionsResource,
  NodeTypesResource,
  UploadsResource,
} from "./resources/index.js";

// ── createClient ────────────────────────────────────────────────────
import { AgenticFlowSDK, type AgenticFlowSDKOptions } from "./core.js";
import { AgentsResource } from "./resources/agents.js";
import { WorkflowsResource } from "./resources/workflows.js";
import { ConnectionsResource } from "./resources/connections.js";
import { NodeTypesResource } from "./resources/node-types.js";
import { UploadsResource } from "./resources/uploads.js";

export interface AgenticFlowClient {
  /** Agent CRUD, streaming, publishing, uploads */
  agents: AgentsResource;
  /** Workflow CRUD, runs, history */
  workflows: WorkflowsResource;
  /** App-connection CRUD, categories, health checks */
  connections: ConnectionsResource;
  /** Node-type discovery, search, dynamic options */
  nodeTypes: NodeTypesResource;
  /** Anonymous upload sessions */
  uploads: UploadsResource;
  /** Low-level SDK instance for advanced / raw requests */
  sdk: AgenticFlowSDK;
}

/**
 * Create a fully-wired AgenticFlow client.
 *
 * @example
 * ```ts
 * import { createClient } from "@pixelml/agenticflow-sdk";
 *
 * const client = createClient({
 *   apiKey: process.env.AGENTICFLOW_API_KEY,
 *   workspaceId: process.env.WORKSPACE_ID,
 *   projectId: process.env.PROJECT_ID,
 * });
 *
 * const agents = await client.agents.list();
 * const workflow = await client.workflows.get("workflow-id");
 * ```
 */
export function createClient(options: AgenticFlowSDKOptions = {}): AgenticFlowClient {
  const sdk = new AgenticFlowSDK(options);
  return {
    agents: new AgentsResource(sdk),
    workflows: new WorkflowsResource(sdk),
    connections: new ConnectionsResource(sdk),
    nodeTypes: new NodeTypesResource(sdk),
    uploads: new UploadsResource(sdk),
    sdk,
  };
}
