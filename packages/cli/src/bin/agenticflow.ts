#!/usr/bin/env node

/**
 * AgenticFlow CLI entry point.
 */

import { runCli } from "../cli/main.js";

runCli().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      schema: "agenticflow.error.v1",
      code: "cli_error",
      message,
    }, null, 2));
  } else {
    console.error(message);
  }
  process.exit(1);
});
