# AgenticFlow JavaScript SDK

A typed JavaScript/TypeScript SDK for building applications with
the [AgenticFlow](https://agenticflow.ai) platform. Manage agents, workflows,
connections, and more — all from a single client.

## Installation

```bash
npm install @pixelml/agenticflow-sdk
# or
yarn add @pixelml/agenticflow-sdk
# or
pnpm add @pixelml/agenticflow-sdk
```

## Quick Start

```typescript
import { createClient } from "@pixelml/agenticflow-sdk";

const client = createClient({
  apiKey: process.env.AGENTICFLOW_API_KEY,
  workspaceId: process.env.AGENTICFLOW_WORKSPACE_ID,
  projectId: process.env.AGENTICFLOW_PROJECT_ID,
});

// List all agents
const agents = await client.agents.list();
console.log(agents.data);

// Run a workflow
const run = await client.workflows.run({
  workflow_id: "wf-abc123",
  input: { prompt: "Hello!" },
});
console.log(run.data);
```

## Authentication

The SDK uses API key authentication via the `Authorization: Bearer` header.

```typescript
const client = createClient({
  apiKey: "sk-...",
});
```

The `apiKey` can also be read automatically from the `AGENTICFLOW_API_KEY`
environment variable if not provided explicitly.

## Configuration

| Option | Env Variable | Description |
|---|---|---|
| `apiKey` | `AGENTICFLOW_API_KEY` | API key for authentication |
| `workspaceId` | `AGENTICFLOW_WORKSPACE_ID` | Default workspace ID |
| `projectId` | `AGENTICFLOW_PROJECT_ID` | Default project ID |
| `baseUrl` | — | API base URL (default: `https://api.agenticflow.ai/`) |
| `timeout` | — | Request timeout |
| `defaultHeaders` | — | Custom headers for all requests |

## Resources

### Agents

```typescript
// List agents (with optional filters)
await client.agents.list({ limit: 20, offset: 0 });

// CRUD
await client.agents.create({ name: "My Agent", ... });
await client.agents.get("agent-id");
await client.agents.update("agent-id", { name: "Updated" });
await client.agents.delete("agent-id");

// Streaming
await client.agents.stream("agent-id", { input: "Hello" });

// Publishing
await client.agents.getPublishInfo("agent-id", { platform: "telegram" });
await client.agents.publish("agent-id", { platform: "web" });
await client.agents.unpublish("agent-id", { platform: "web" });

// File uploads
await client.agents.uploadFile("agent-id", filePayload);
await client.agents.getUploadSession("agent-id", "session-id");

// Misc
await client.agents.getReferenceImpact("agent-id");
await client.agents.saveAsTemplate("agent-id", templatePayload);
```

### Workflows

```typescript
// List workflows in a workspace
await client.workflows.list({ limit: 10, searchQuery: "my flow" });

// CRUD
await client.workflows.create({ name: "New Workflow", ... });
await client.workflows.get("workflow-id");
await client.workflows.update("workflow-id", updatePayload);
await client.workflows.delete("workflow-id");

// Run a workflow
const run = await client.workflows.run({
  workflow_id: "workflow-id",
  input: { key: "value" },
});

// Check run status
await client.workflows.getRun("run-id");

// List runs for a workflow
await client.workflows.listRuns("workflow-id", { limit: 50 });

// Run history
await client.workflows.runHistory("workflow-id");

// Validate a workflow definition
await client.workflows.validate(workflowPayload);

// Reference impact analysis
await client.workflows.getReferenceImpact("workflow-id");

// Like / Unlike
await client.workflows.like("workflow-id");
await client.workflows.unlike("workflow-id");
await client.workflows.getLikeStatus("workflow-id");
```

### Connections

```typescript
// List connections (requires projectId)
await client.connections.list();

// CRUD
await client.connections.create(connectionPayload);
await client.connections.update("conn-id", updatePayload);
await client.connections.delete("conn-id");

// Get default connection for a category
await client.connections.getDefault({ categoryName: "llm" });

// List connection categories
await client.connections.categories();

// Health checks
await client.connections.healthCheckPreCreate(configPayload);
await client.connections.healthCheckPostCreate("conn-id");
```

### Node Types

```typescript
// List all node types
await client.nodeTypes.list();

// Get a specific node type by name
await client.nodeTypes.get("node-type-name");

// Search node types
await client.nodeTypes.search("text generation");

// Get dynamic options for a node type field
await client.nodeTypes.dynamicOptions({
  name: "node-type-name",
  fieldName: "model",
  connection: "conn-id",
});
```

### Uploads

```typescript
// Create an anonymous upload session
await client.uploads.inputCreate({ filename: "data.csv", ... });

// Check upload session status
await client.uploads.inputStatus("session-id");
```

## Error Handling

The SDK throws typed errors for different HTTP status codes:

```typescript
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ServerError,
} from "@pixelml/agenticflow-sdk";

try {
  await client.agents.get("invalid-id");
} catch (err) {
  if (err instanceof NotFoundError) {
    console.log("Agent not found:", err.message);
  } else if (err instanceof AuthenticationError) {
    console.log("Invalid API key");
  } else if (err instanceof RateLimitError) {
    console.log("Rate limited, retry later");
  }
}
```

| Error Class | HTTP Status |
|---|---|
| `ValidationError` | 400, 422 |
| `AuthenticationError` | 401 |
| `AuthorizationError` | 403 |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `RateLimitError` | 429 |
| `ServerError` | 5xx |

## Low-Level Access

For endpoints not covered by resource classes, use the underlying SDK instance:

```typescript
const response = await client.sdk.get("/v1/custom/endpoint");
const response = await client.sdk.post("/v1/custom/endpoint", {
  json: { key: "value" },
});
```

Available methods: `get`, `post`, `put`, `patch`, `delete`.

## Response Format

All resource methods return an `APIResponse` object:

```typescript
interface APIResponse {
  ok: boolean;
  statusCode: number;
  data: unknown;
  text: string;
  headers: Record<string, string>;
  requestId: string | null;
}
```

## License

Apache-2.0
