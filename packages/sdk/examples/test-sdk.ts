/**
 * Example: test the AgenticFlow SDK locally.
 *
 * Usage:
 *   1. Copy .env.example → .env and fill in your credentials
 *   2. npm run build
 *   3. npx tsx examples/test-sdk.ts
 */
import "dotenv/config";
import { createClient } from "../src/index.js";

async function main() {
  // SDK reads env vars automatically:
  //   AGENTICFLOW_API_KEY, AGENTICFLOW_WORKSPACE_ID, AGENTICFLOW_PROJECT_ID
  const client = createClient({
    // Or override here:
    // apiKey: "sk-...",
    // workspaceId: "...",
    // projectId: "...",
    // baseUrl: "http://localhost:8000",
  });

  console.log("✅ Client initialized");
  console.log("   baseUrl:", client.sdk.baseUrl);
  console.log("   workspaceId:", client.sdk.workspaceId);
  console.log("   projectId:", client.sdk.projectId);
  console.log();

  // ── Agents ──────────────────────────────────────────────────────
  try {
    console.log("📋 Listing agents...");
    const agentList = await client.agents.list({ limit: 5 });
    console.log("   status:", agentList.statusCode);
    console.log("   data:", JSON.stringify(agentList.data, null, 2).slice(0, 200));
  } catch (err) {
    console.error("   ❌ agents.list failed:", (err as Error).message);
  }

  // ── Workflows ───────────────────────────────────────────────────
  try {
    console.log("\n📋 Listing workflows...");
    const workflowList = await client.workflows.list({ limit: 5 });
    console.log("   status:", workflowList.statusCode);
    console.log("   data:", JSON.stringify(workflowList.data, null, 2).slice(0, 200));
  } catch (err) {
    console.error("   ❌ workflows.list failed:", (err as Error).message);
  }

  // ── Connections ─────────────────────────────────────────────────
  try {
    console.log("\n📋 Listing connections...");
    const connList = await client.connections.list({ limit: 5 });
    console.log("   status:", connList.statusCode);
    console.log("   data:", JSON.stringify(connList.data, null, 2).slice(0, 200));
  } catch (err) {
    console.error("   ❌ connections.list failed:", (err as Error).message);
  }

  // ── Connection categories ───────────────────────────────────────
  try {
    console.log("\n📋 Listing connection categories...");
    const cats = await client.connections.categories({ limit: 5 });
    console.log("   status:", cats.statusCode);
    console.log("   data:", JSON.stringify(cats.data, null, 2).slice(0, 200));
  } catch (err) {
    console.error("   ❌ connections.categories failed:", (err as Error).message);
  }

  console.log("\n✅ Done!");
}

main().catch(console.error);
