/**
 * SDK public exports.
 */

export { AgenticFlowSDK, DEFAULT_BASE_URL, AGENTICFLOW_API_KEY, WORKSPACE_ID, PROJECT_ID } from "./core.js";
export type { AgenticFlowSDKOptions } from "./core.js";
export type { APIResponse } from "./types.js";
export { fromFetchResponse } from "./types.js";
export { AgentStream, parseStreamLine } from "./streaming.js";
export type { StreamPart, StreamPartType, StreamRequest, StreamMessage, AgentStreamEventMap } from "./streaming.js";
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
  AgentThreadsResource,
  KnowledgeResource,
  DatabaseResource,
  McpClientsResource,
} from "./resources/index.js";

// ── createClient ────────────────────────────────────────────────────
import { AgenticFlowSDK, type AgenticFlowSDKOptions } from "./core.js";
import { AgentsResource } from "./resources/agents.js";
import { WorkflowsResource } from "./resources/workflows.js";
import { ConnectionsResource } from "./resources/connections.js";
import { NodeTypesResource } from "./resources/node-types.js";
import { UploadsResource } from "./resources/uploads.js";
import { AgentThreadsResource } from "./resources/agent-threads.js";
import { KnowledgeResource } from "./resources/knowledge.js";
import { DatabaseResource } from "./resources/database.js";
import { McpClientsResource } from "./resources/mcp-clients.js";

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
  /** Agent thread CRUD, messages */
  agentThreads: AgentThreadsResource;
  /** Knowledge (datasets) CRUD, rows, embeddings, search */
  knowledge: KnowledgeResource;
  /** Database datasets CRUD */
  database: DatabaseResource;
  /** MCP client listing */
  mcpClients: McpClientsResource;
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
 * const threads = await client.agentThreads.list();
 * const datasets = await client.knowledge.list();
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
    agentThreads: new AgentThreadsResource(sdk),
    knowledge: new KnowledgeResource(sdk),
    database: new DatabaseResource(sdk),
    mcpClients: new McpClientsResource(sdk),
    sdk,
  };
}
