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
import { cpSync, mkdirSync, chmodSync, statSync } from "node:fs";
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

// Ensure every bin entry is executable — see block comment above for why.
const binFiles = ["dist/bin/agenticflow.js"];
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
