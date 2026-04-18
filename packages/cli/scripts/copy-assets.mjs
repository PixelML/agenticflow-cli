/**
 * Copy static JSON assets into dist/ after TypeScript compilation, and
 * ensure the CLI entrypoint is executable.
 *
 * Why the chmod: `tsc` emits files with 0644 (non-executable) permissions.
 * For `npm install -g` from a published tarball, npm sets the +x bit
 * automatically based on the `bin` field in package.json. But for local
 * dev installs (`npm link`, workspaces, monorepo symlinks), the source
 * file's permissions are used as-is — hitting `permission denied` when
 * users try to run `agenticflow` or `af` directly. Fix: explicitly
 * chmod +x every bin entry at build time.
 */
import { cpSync, mkdirSync, chmodSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const assets = [
  {
    src: "src/cli/data/openapi.json",
    dest: "dist/cli/data/openapi.json",
  },
  {
    src: "src/cli/data/public_ops_manifest.json",
    dest: "dist/cli/data/public_ops_manifest.json",
  },
];

for (const { src, dest } of assets) {
  const srcPath = resolve(root, src);
  const destPath = resolve(root, dest);
  mkdirSync(dirname(destPath), { recursive: true });
  cpSync(srcPath, destPath);
  console.log(`Copied ${src} -> ${dest}`);
}

const launcherPath = resolve(root, "dist/bin/agenticflow.cjs");
writeFileSync(
  launcherPath,
  `#!/usr/bin/env node
"use strict";

var major = parseInt((process.versions.node || "0").split(".")[0], 10);
if (!major || major < 18) {
  console.error("AgenticFlow CLI requires Node.js 18+.");
  console.error("Current runtime: " + process.version);
  console.error("Upgrade Node, then re-run the command.");
  process.exit(1);
}

var path = require("path");
var cp = require("child_process");
var target = path.join(__dirname, "agenticflow.js");
var result = cp.spawnSync(process.execPath, [target].concat(process.argv.slice(2)), {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message || String(result.error));
  process.exit(1);
}

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
`,
  "utf-8",
);
console.log("Wrote dist/bin/agenticflow.cjs");

// Ensure every bin entry is executable — see block comment above for why.
const binFiles = ["dist/bin/agenticflow.js", "dist/bin/agenticflow.cjs"];
for (const binPath of binFiles) {
  const p = resolve(root, binPath);
  try {
    chmodSync(p, 0o755);
    const mode = (statSync(p).mode & 0o777).toString(8);
    console.log(`chmod +x ${binPath}  (mode ${mode})`);
  } catch (err) {
    console.warn(`Could not chmod ${binPath}:`, err.message);
  }
}
