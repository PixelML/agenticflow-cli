#!/usr/bin/env node

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const cliArgs = process.argv.slice(2);
const repoRoot = path.resolve(__dirname, "..");
const localVenvPython = path.join(repoRoot, ".venv", "bin", "python");

const candidates = [
  { cmd: "agenticflow", args: cliArgs, env: { AGENTICFLOW_NODE_WRAPPER: "1" } },
  ...(fs.existsSync(localVenvPython)
    ? [{ cmd: localVenvPython, args: ["-m", "agenticflow_cli", ...cliArgs] }]
    : []),
  { cmd: "python3", args: ["-m", "agenticflow_cli", ...cliArgs] },
  { cmd: "python", args: ["-m", "agenticflow_cli", ...cliArgs] }
];

for (const candidate of candidates) {
  const env = { ...process.env, ...(candidate.env || {}) };
  const result = spawnSync(candidate.cmd, candidate.args, {
    stdio: "inherit",
    env
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      continue;
    }
    console.error(`[agenticflow wrapper] Failed to execute ${candidate.cmd}: ${result.error.message}`);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

console.error(
  "[agenticflow wrapper] Could not find a runnable AgenticFlow CLI. " +
    "Install Python package `agenticflow-cli` and ensure Python is available."
);
process.exit(1);
