#!/usr/bin/env node

/**
 * AgenticFlow CLI entry point.
 */

// SECURITY: Some parent environments (notably certain Claude Code launch
// aliases) set NODE_TLS_REJECT_UNAUTHORIZED=0 for their own reasons. When the
// CLI inherits that env, Node prints a noisy and alarming warning on EVERY
// invocation AND the CLI's HTTPS calls to api.agenticflow.ai skip cert
// verification. We talk to a public HTTPS endpoint with a valid cert — we
// should never opt out of TLS verification. Unset the env var before anything
// else imports it, unless the user explicitly opts in via AF_INSECURE_TLS=1
// (e.g. for a local dev backend with a self-signed cert).
if (
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] === "0" &&
  process.env["AF_INSECURE_TLS"] !== "1"
) {
  delete process.env["NODE_TLS_REJECT_UNAUTHORIZED"];
}

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
