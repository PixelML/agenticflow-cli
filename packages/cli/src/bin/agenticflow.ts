#!/usr/bin/env node

/**
 * AgenticFlow CLI entry point.
 */

import { runCli } from "../cli/main.js";

runCli().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
