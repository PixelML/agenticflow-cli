/**
 * Changelog for AI agents and humans.
 *
 * Shown on `af changelog`, included in `af bootstrap --json`,
 * and displayed after upgrade.
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: string[];
  for_ai: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.3.0",
    date: "2026-04-04",
    highlights: [
      "Gemma 4 31B and 26B models now available (agenticflow/gemma-4-31b-it)",
      "Amazon Seller Pack v3: 5-agent company blueprint with 8 skills + 4 data workflows",
      "`af paperclip init --blueprint amazon-seller` deploys a full seller team in one command",
      "`af bootstrap --json` — single command returns auth, agents, schemas, commands",
      "`af agent scaffold` — generate valid create payloads from schema",
      "`af agent run` — non-streaming task execution, returns structured JSON with thread_id",
      "Non-interactive `af login` (works with env vars, no TTY needed)",
      "Gateway returns actual response text + thread_id in webhook responses",
      "Paperclip heartbeat spam fix (intervalSec=0 by default)",
      "Thread reuse per issue (same task = same conversation)",
      "12 playbooks including AI-executable company-from-scratch and amazon-seller",
      "6 company blueprints: dev-shop, marketing-agency, sales-team, content-studio, support-center, amazon-seller",
    ],
    for_ai: [
      "Run `af bootstrap --json` to get auth status, agent list, schemas, and commands in ONE call",
      "Use `af agent run --agent-id <id> --message <msg> --json` for non-streaming (returns { response, thread_id })",
      "Use `af schema <resource> --json` to learn payload formats before constructing them",
      "Use `--fields id,name,model` on list commands to save 96% of context window",
      "Use `--dry-run` on create commands to validate without side effects",
      "Available models: gemma-4-31b-it, gemma-4-26b-a4b-it, gemini-2.0-flash, gpt-4o-mini, deepseek-v3.2, qwen-3.5-flash",
      "To deploy a Paperclip company: `af paperclip init --blueprint <id> --json` then `af paperclip connect`",
      "Blueprints: dev-shop, marketing-agency, sales-team, content-studio, support-center, amazon-seller",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-04-02",
    highlights: [
      "Paperclip integration: deploy AF agents to Paperclip companies",
      "Webhook gateway: receive tasks from Paperclip, Linear, or any webhook",
      "AI-agent UX: context, schema, --fields, --dry-run",
      "10 playbooks for onboarding and deployment",
    ],
    for_ai: [
      "Use `af context --json` for bootstrap guide",
      "Use `af playbook <topic>` for step-by-step execution guides",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-03-31",
    highlights: [
      "Initial Paperclip deploy command",
      "Gateway with paperclip and webhook channels",
      "CONTEXT.md skill file for AI agents",
    ],
    for_ai: [
      "Run `af --help` to discover all commands",
    ],
  },
];

export function getLatestChangelog(): ChangelogEntry {
  return CHANGELOG[0];
}

export function getChangelogSince(version: string): ChangelogEntry[] {
  const idx = CHANGELOG.findIndex((e) => e.version === version);
  if (idx <= 0) return [CHANGELOG[0]];
  return CHANGELOG.slice(0, idx);
}
