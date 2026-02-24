/**
 * Copy static JSON assets into dist/ after TypeScript compilation.
 */
import { cpSync, mkdirSync } from "node:fs";
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
