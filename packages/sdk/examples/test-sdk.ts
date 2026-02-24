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
    const agents = await client.agents.list({ limit: 5 });
    console.log("   data:", JSON.stringify(agents, null, 2).slice(0, 200));
  } catch (err) {
    console.error("   ❌ agents.list failed:", (err as Error).message);
  }

  // ── Workflows ───────────────────────────────────────────────────
  try {
    console.log("\n📋 Listing workflows...");
    const workflows = await client.workflows.list({ limit: 5 });
    console.log("   data:", JSON.stringify(workflows, null, 2).slice(0, 200));
  } catch (err) {
    console.error("   ❌ workflows.list failed:", (err as Error).message);
  }

  // ── Connections ─────────────────────────────────────────────────
  try {
    console.log("\n📋 Listing connections...");
    const connections = await client.connections.list({ limit: 5 });
    console.log("   data:", JSON.stringify(connections, null, 2).slice(0, 200));
  } catch (err) {
    console.error("   ❌ connections.list failed:", (err as Error).message);
  }

  // ── Connection categories ───────────────────────────────────────
  try {
    console.log("\n📋 Listing connection categories...");
    const cats = await client.connections.categories({ limit: 5 });
    console.log("   data:", JSON.stringify(cats, null, 2).slice(0, 200));
  } catch (err) {
    console.error("   ❌ connections.categories failed:", (err as Error).message);
  }

  console.log("\n✅ Done!");
}

main().catch(console.error);
