# @pixelml/agenticflow-sdk

Typed JavaScript / TypeScript SDK for the [AgenticFlow](https://agenticflow.ai) API.
Manage agents, workflows, connections, node types and uploads from a single client
object — with automatic auth, path-parameter resolution and structured error classes.

## Installation

```bash
npm install @pixelml/agenticflow-sdk
# or
yarn add @pixelml/agenticflow-sdk
# or
pnpm add @pixelml/agenticflow-sdk
```

**Requirements:** Node.js ≥ 18

## Quick Start

```typescript
import { createClient } from "@pixelml/agenticflow-sdk";

const client = createClient({
  apiKey: process.env.AGENTICFLOW_API_KEY,
  workspaceId: process.env.AGENTICFLOW_WORKSPACE_ID,
  projectId: process.env.AGENTICFLOW_PROJECT_ID,
});

// List agents
const agents = await client.agents.list();

// Run a workflow
const run = await client.workflows.run({
  workflow_id: "wf-abc123",
  input: { prompt: "Hello!" },
});
```

## Configuration

| Option | Env Variable | Description |
|---|---|---|
| `apiKey` | `AGENTICFLOW_API_KEY` | API key (sent as `Bearer` token) |
| `workspaceId` | `AGENTICFLOW_WORKSPACE_ID` | Default workspace ID |
| `projectId` | `AGENTICFLOW_PROJECT_ID` | Default project ID |
| `baseUrl` | — | API base URL (default: `https://api.agenticflow.ai/`) |
| `timeout` | — | Request timeout in milliseconds |
| `defaultHeaders` | — | Extra headers sent with every request |

> **Note:** If `apiKey` is omitted, the SDK reads `AGENTICFLOW_API_KEY` from the
> environment automatically.

## Resources

All resource methods return the response **data** directly (the parsed JSON body),
not a wrapper object.

### Agents

```typescript
// List
await client.agents.list({ projectId, searchQuery, limit, offset });

// CRUD
await client.agents.create(payload);
await client.agents.get("agent-id");
await client.agents.update("agent-id", payload);
await client.agents.delete("agent-id");

// Anonymous access (no API key required)
await client.agents.getAnonymous("agent-id");

// Streaming
await client.agents.stream("agent-id", payload);
await client.agents.streamAnonymous("agent-id", payload);

// File uploads
await client.agents.uploadFile("agent-id", payload);
await client.agents.getUploadSession("agent-id", "session-id");
await client.agents.uploadFileAnonymous("agent-id", payload);
await client.agents.getUploadSessionAnonymous("agent-id", "session-id");

// Reference impact
await client.agents.getReferenceImpact("agent-id");
```

### Workflows

```typescript
// List (requires workspaceId)
await client.workflows.list({ workspaceId, projectId, searchQuery, limit, offset });

// CRUD
await client.workflows.create(payload, workspaceId);
await client.workflows.get("workflow-id");
await client.workflows.getAnonymous("workflow-id");
await client.workflows.update("workflow-id", payload, workspaceId);
await client.workflows.delete("workflow-id", workspaceId);

// Runs
await client.workflows.run(payload);
await client.workflows.runAnonymous(payload);
await client.workflows.getRun("run-id");
await client.workflows.getRunAnonymous("run-id");
await client.workflows.listRuns("workflow-id", { workspaceId, limit, offset, sortOrder });
await client.workflows.runHistory("workflow-id", { limit, offset });

// Validation
await client.workflows.validate(payload);

// Reference impact
await client.workflows.getReferenceImpact("workflow-id");

// Like / Unlike
await client.workflows.like("workflow-id");
await client.workflows.unlike("workflow-id");
await client.workflows.getLikeStatus("workflow-id");
```

### Connections

```typescript
// List (requires projectId)
await client.connections.list({ workspaceId, projectId, limit, offset });

// CRUD
await client.connections.create(payload, workspaceId);
await client.connections.update("conn-id", payload, workspaceId);
await client.connections.delete("conn-id", workspaceId);

// Default connection for a category
await client.connections.getDefault({ categoryName: "llm", workspaceId, projectId });

// List categories
await client.connections.categories({ workspaceId, limit, offset });
```

### Node Types

```typescript
// List & get
await client.nodeTypes.list();
await client.nodeTypes.get("node-type-name");

// Search (client-side text match)
await client.nodeTypes.search("text generation");

// Dynamic field options
await client.nodeTypes.dynamicOptions({
  name: "node-type-name",
  fieldName: "model",
  connection: "conn-id",
  projectId: "proj-id",
  searchTerm: "gpt",
});
```

### Uploads

```typescript
// Anonymous upload sessions
await client.uploads.inputCreate({ filename: "data.csv" });
await client.uploads.inputStatus("session-id");
```

## Error Handling

The SDK throws structured errors for every non-2xx response:

```typescript
import {
  AuthenticationError,
  NotFoundError,
  RateLimitError,
} from "@pixelml/agenticflow-sdk";

try {
  await client.agents.get("invalid-id");
} catch (err) {
  if (err instanceof NotFoundError) {
    console.log(err.statusCode); // 404
    console.log(err.message);
    console.log(err.payload);    // raw response body
    console.log(err.requestId);  // X-Request-Id if present
  }
}
```

| Error Class | HTTP Status |
|---|---|
| `ValidationError` | 400 / 422 |
| `AuthenticationError` | 401 |
| `AuthorizationError` | 403 |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `RateLimitError` | 429 |
| `ServerError` | 5xx |
| `NetworkError` | Connection / DNS failures |
| `RequestTimeoutError` | Timeout exceeded |

All API errors extend `APIError`, which extends `AgenticFlowError` (→ `Error`).

## Low-Level Access

For endpoints not covered by resource classes, use the SDK instance directly:

```typescript
// HTTP convenience methods
const data = await client.sdk.get("/v1/health");
const data = await client.sdk.post("/v1/custom", { json: { key: "value" } });
const data = await client.sdk.put("/v1/custom/123", { json: payload });
const data = await client.sdk.patch("/v1/custom/123", { json: patch });
const data = await client.sdk.delete("/v1/custom/123");

// Full control
const data = await client.sdk.request("POST", "/v1/agents/{agent_id}/run", {
  pathParams: { agent_id: "abc" },
  queryParams: { verbose: true },
  json: { input: "Hello" },
  headers: { "X-Custom": "value" },
});
```

## License

Apache-2.0
