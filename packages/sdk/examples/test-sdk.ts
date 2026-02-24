/**
 * Example: test the AgenticFlow SDK locally.
 *
 * Usage:
 *   1. Copy .env.example → .env and fill in your credentials
 *   2. npm run build
 *   3. npx tsx examples/test-sdk.ts
 */
import "dotenv/config";
import {
  AgenticFlowSDK,
  AgentsResource,
  WorkflowsResource,
  ConnectionsResource,
} from "../src/index.js";

async function main() {
  // SDK reads from env automatically:
  //   AGENTICFLOW_API_KEY, AGENTICFLOW_WORKSPACE_ID, AGENTICFLOW_PROJECT_ID
  const sdk = new AgenticFlowSDK({
    // Or override here:
    // apiKey: "sk-...",
    // workspaceId: "...",
    // projectId: "...",
    // baseUrl: "http://localhost:8000",
  });

  console.log("✅ SDK initialized");
  console.log("   baseUrl:", sdk.baseUrl);
  console.log("   workspaceId:", sdk.workspaceId);
  console.log("   projectId:", sdk.projectId);
  console.log("   apiKey:", sdk.apiKey ? `${sdk.apiKey.slice(0, 8)}...` : "(none)");
  console.log();

  const agents = new AgentsResource(sdk);
  const workflows = new WorkflowsResource(sdk);
  const connections = new ConnectionsResource(sdk);

  // ── Agents ──────────────────────────────────────────────────────
  try {
    console.log("📋 Listing agents...");
    const agentList = await agents.list({ limit: 5 });
    console.log("   status:", agentList.statusCode);
    console.log("   data:", JSON.stringify(agentList.data, null, 2).slice(0, 200));
  } catch (err) {
    console.error("   ❌ agents.list failed:", (err as Error).message);
  }

  // ── Workflows ───────────────────────────────────────────────────
  try {
    console.log("\n📋 Listing workflows...");
    const workflowList = await workflows.list({ limit: 5 });
    console.log("   status:", workflowList.statusCode);
    console.log("   data:", JSON.stringify(workflowList.data, null, 2).slice(0, 200));
  } catch (err) {
    console.error("   ❌ workflows.list failed:", (err as Error).message);
  }

  // ── Connections ─────────────────────────────────────────────────
  try {
    console.log("\n📋 Listing connections...");
    const connList = await connections.list({ limit: 5 });
    console.log("   status:", connList.statusCode);
    console.log("   data:", JSON.stringify(connList.data, null, 2).slice(0, 200));
  } catch (err) {
    console.error("   ❌ connections.list failed:", (err as Error).message);
  }

  // ── Connection categories ───────────────────────────────────────
  try {
    console.log("\n📋 Listing connection categories...");
    const cats = await connections.categories({ limit: 5 });
    console.log("   status:", cats.statusCode);
    console.log("   data:", JSON.stringify(cats.data, null, 2).slice(0, 200));
  } catch (err) {
    console.error("   ❌ connections.categories failed:", (err as Error).message);
  }

  console.log("\n✅ Done!");
}

main().catch(console.error);
