/**
 * Pack registry — install, uninstall, and list installed packs.
 *
 * Installed packs live under `~/.agenticflow/packs/<name>/`.
 * Each installed pack has a `.install.json` manifest tracking
 * provisioned workflow IDs and metadata.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { resolve, join, basename } from "node:path";
import { homedir, tmpdir } from "node:os";
import { execSync } from "node:child_process";

import type { AgenticFlowClient } from "@pixelml/agenticflow-sdk";
import { validatePackAtPath, loadPackManifest, type PackManifest } from "./pack.js";
import {
  findSkillsInPack,
  buildWorkflowFromSkill,
  type SkillDefinition,
} from "./skill.js";

// ───────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────

export type PackSourceKind = "github" | "git" | "local";

export interface PackSource {
  kind: PackSourceKind;
  raw: string;
  /** For github: "owner/repo", for git: URL, for local: absolute path */
  location: string;
  /** Derived pack name (last path segment) */
  name: string;
  /** Subdirectory within the repo (e.g. "packs/security-pack" for github:org/repo/packs/security-pack) */
  subpath?: string;
}

export interface PackInstallManifest {
  schema: "agenticflow.pack.install.v1";
  name: string;
  version: string;
  source: PackSource;
  installed_at: string;
  /** Workflow IDs created for atomic skills */
  provisioned_skills: Record<string, string>;
  /** Workflow IDs created for pack entrypoints */
  provisioned_entrypoints: Record<string, string>;
  /** Skill definitions found in the pack */
  skill_count: number;
  skill_names: string[];
}

export interface InstalledPackSummary {
  name: string;
  version: string;
  path: string;
  installed_at: string;
  skill_count: number;
  skill_names: string[];
  entrypoint_count: number;
}

export interface PackInstallOptions {
  force?: boolean;
  skipProvision?: boolean;
  workspaceId?: string;
  projectId?: string;
}

export interface PackUninstallResult {
  name: string;
  path: string;
  deleted_cloud_workflows: string[];
}

// ───────────────────────────────────────────────────────────────────
// Packs directory
// ───────────────────────────────────────────────────────────────────

/**
 * Return the root packs directory. Honors AGENTICFLOW_CLI_DIR.
 */
export function packsDir(): string {
  const envDir = process.env["AGENTICFLOW_CLI_DIR"];
  const base = envDir ?? resolve(homedir(), ".agenticflow");
  const dir = resolve(base, "packs");
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ───────────────────────────────────────────────────────────────────
// Source parsing
// ───────────────────────────────────────────────────────────────────

/**
 * Parse a pack source string into a structured PackSource.
 *
 * Supported formats:
 *   github:owner/repo
 *   https://github.com/owner/repo.git
 *   git@github.com:owner/repo.git
 *   /absolute/local/path
 *   ./relative/path
 */
/**
 * Parse a GitHub slug that may contain a subpath beyond owner/repo.
 * e.g. "PixelML/skills/packs/security-pack" → repo "PixelML/skills", subpath "packs/security-pack"
 */
function parseGitHubSlug(slug: string, raw: string): PackSource {
  const parts = slug.split("/");
  const repo = parts.slice(0, 2).join("/");
  const subpath = parts.length > 2 ? parts.slice(2).join("/") : undefined;
  const name = parts[parts.length - 1];
  return {
    kind: "github",
    raw,
    location: repo,
    name,
    subpath,
  };
}

export function parsePackSource(raw: string): PackSource {
  if (raw.startsWith("github:")) {
    const slug = raw.slice("github:".length).replace(/\.git$/, "");
    return parseGitHubSlug(slug, raw);
  }

  // Check GitHub HTTPS URLs before generic git URLs so
  // "https://github.com/org/repo.git" is classified as "github"
  if (raw.startsWith("https://github.com/")) {
    const slug = raw.replace("https://github.com/", "").replace(/\.git$/, "").replace(/\/$/, "");
    return parseGitHubSlug(slug, raw);
  }

  if (raw.startsWith("git@") || (raw.startsWith("https://") && raw.includes(".git"))) {
    const name = basename(raw).replace(/\.git$/, "");
    return {
      kind: "git",
      raw,
      location: raw,
      name,
    };
  }

  // Local path
  const absPath = resolve(raw);
  const name = basename(absPath);
  return {
    kind: "local",
    raw,
    location: absPath,
    name,
  };
}

// ───────────────────────────────────────────────────────────────────
// Install
// ───────────────────────────────────────────────────────────────────

/**
 * Install a pack from a source (git or local).
 *
 * 1. Parse source → clone/copy to ~/.agenticflow/packs/<name>/
 * 2. Validate pack.yaml
 * 3. If client provided: provision workflows on cloud
 * 4. Write .install.json
 */
export async function installPack(
  source: PackSource,
  client?: AgenticFlowClient | null,
  options?: PackInstallOptions,
): Promise<PackInstallManifest> {
  const targetDir = resolve(packsDir(), source.name);

  if (existsSync(targetDir)) {
    if (!options?.force) {
      throw new Error(
        `Pack '${source.name}' is already installed at ${targetDir}. Use --force to overwrite.`,
      );
    }
    rmSync(targetDir, { recursive: true, force: true });
  }

  // Clone or copy
  if (source.kind === "github" && source.subpath) {
    // Monorepo: clone to temp dir, then copy the subpath
    const tmpClone = mkdtempSync(join(tmpdir(), "agenticflow-pack-clone-"));
    try {
      const url = `https://github.com/${source.location}.git`;
      execSync(`git clone --depth 1 ${url} ${tmpClone}`, { stdio: "pipe" });
      const subDir = resolve(tmpClone, source.subpath);
      if (!existsSync(subDir)) {
        throw new Error(
          `Subpath '${source.subpath}' not found in ${source.location}. Check the path and try again.`,
        );
      }
      mkdirSync(targetDir, { recursive: true });
      execSync(`cp -R "${subDir}/." "${targetDir}/"`, { stdio: "pipe" });
    } finally {
      rmSync(tmpClone, { recursive: true, force: true });
    }
  } else if (source.kind === "github") {
    const url = `https://github.com/${source.location}.git`;
    execSync(`git clone --depth 1 ${url} ${targetDir}`, {
      stdio: "pipe",
    });
  } else if (source.kind === "git") {
    execSync(`git clone --depth 1 ${source.location} ${targetDir}`, {
      stdio: "pipe",
    });
  } else {
    // Local: copy directory
    mkdirSync(targetDir, { recursive: true });
    execSync(`cp -R "${source.location}/." "${targetDir}/"`, {
      stdio: "pipe",
    });
  }

  // Validate
  const validation = validatePackAtPath(targetDir);
  if (!validation.valid) {
    const errSummary = validation.errors.map((e) => e.message).join("; ");
    throw new Error(`Pack validation failed: ${errSummary}`);
  }

  // Load manifest
  const { manifest } = loadPackManifest(targetDir);

  // Check required tools
  const missingTools: string[] = [];
  for (const tool of manifest.requirements?.tools ?? []) {
    if (!tool?.name) continue;
    if (!isToolOnPath(tool.name)) {
      missingTools.push(tool.name);
    }
  }
  if (missingTools.length > 0) {
    console.error(`Warning: Required tools not found on PATH: ${missingTools.join(", ")}`);
  }

  // Discover skills
  const skills = findSkillsInPack(targetDir);

  // Provision workflows on cloud
  const provisionedSkills: Record<string, string> = {};
  const provisionedEntrypoints: Record<string, string> = {};

  if (client && !options?.skipProvision) {
    // Fetch connections for auto-resolution during provisioning
    let connections: Record<string, unknown>[] = [];
    try {
      const connResult = await client.connections.list({
        workspaceId: options?.workspaceId,
        projectId: options?.projectId,
        limit: 200,
      });
      if (Array.isArray(connResult)) {
        connections = connResult as Record<string, unknown>[];
      }
    } catch {
      // connections unavailable — proceed without
    }

    // Provision each atomic skill as a workflow
    for (const skill of skills) {
      if (skill.kind !== "Skill" || !skill.node_type) continue;
      try {
        // Auto-resolve connection for this skill
        let connectionId: string | undefined;
        if (skill.connection_category && connections.length > 0) {
          const category = skill.connection_category.toLowerCase();
          const match = connections.find((c) => {
            const cat = ((c["category"] as string) ?? "").toLowerCase();
            return cat === category || cat.includes(category) || category.includes(cat);
          });
          if (match) connectionId = match["id"] as string;
        }
        const workflowPayload = buildWorkflowFromSkill(skill, options?.projectId, connectionId);
        const created = await client.workflows.create(
          workflowPayload,
          options?.workspaceId,
        ) as Record<string, unknown>;
        const workflowId = extractId(created);
        if (workflowId) {
          provisionedSkills[skill.name] = workflowId;
        }
      } catch (err) {
        console.error(`Warning: Failed to provision skill '${skill.name}': ${err instanceof Error ? err.message : err}`);
      }
    }

    // Provision pack entrypoints
    for (const entry of manifest.entrypoints ?? []) {
      const workflowFile = resolve(targetDir, entry.workflow);
      if (!existsSync(workflowFile)) continue;
      try {
        const body = JSON.parse(readFileSync(workflowFile, "utf-8"));
        const created = await client.workflows.create(
          body,
          options?.workspaceId,
        ) as Record<string, unknown>;
        const workflowId = extractId(created);
        if (workflowId) {
          provisionedEntrypoints[entry.id] = workflowId;
        }
      } catch (err) {
        console.error(`Warning: Failed to provision entrypoint '${entry.id}': ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Write .install.json
  const installManifest: PackInstallManifest = {
    schema: "agenticflow.pack.install.v1",
    name: manifest.name ?? source.name,
    version: manifest.version ?? "0.0.0",
    source,
    installed_at: new Date().toISOString(),
    provisioned_skills: provisionedSkills,
    provisioned_entrypoints: provisionedEntrypoints,
    skill_count: skills.length,
    skill_names: skills.map((s) => s.name),
  };

  writeFileSync(
    resolve(targetDir, ".install.json"),
    JSON.stringify(installManifest, null, 2),
    "utf-8",
  );

  return installManifest;
}

// ───────────────────────────────────────────────────────────────────
// List installed packs
// ───────────────────────────────────────────────────────────────────

/**
 * Scan ~/.agenticflow/packs/ and return summaries of all installed packs.
 */
export function listInstalledPacks(): InstalledPackSummary[] {
  const dir = packsDir();
  if (!existsSync(dir)) return [];

  const entries = readdirSync(dir);
  const result: InstalledPackSummary[] = [];

  for (const entry of entries) {
    const entryPath = join(dir, entry);
    if (!statSync(entryPath).isDirectory()) continue;

    const installFile = join(entryPath, ".install.json");
    if (!existsSync(installFile)) {
      // Try to build summary from pack.yaml directly
      try {
        const { manifest } = loadPackManifest(entryPath);
        const skills = findSkillsInPack(entryPath);
        result.push({
          name: manifest.name ?? entry,
          version: manifest.version ?? "unknown",
          path: entryPath,
          installed_at: "unknown",
          skill_count: skills.length,
          skill_names: skills.map((s) => s.name),
          entrypoint_count: manifest.entrypoints?.length ?? 0,
        });
      } catch {
        // skip invalid directories
      }
      continue;
    }

    try {
      const manifest = JSON.parse(readFileSync(installFile, "utf-8")) as PackInstallManifest;
      // Load pack manifest for entrypoint count
      let entrypointCount = 0;
      try {
        const { manifest: packManifest } = loadPackManifest(entryPath);
        entrypointCount = packManifest.entrypoints?.length ?? 0;
      } catch {
        // ignore
      }

      result.push({
        name: manifest.name,
        version: manifest.version,
        path: entryPath,
        installed_at: manifest.installed_at,
        skill_count: manifest.skill_count,
        skill_names: manifest.skill_names,
        entrypoint_count: entrypointCount,
      });
    } catch {
      // skip broken install manifests
    }
  }

  return result;
}

// ───────────────────────────────────────────────────────────────────
// Resolve installed pack root
// ───────────────────────────────────────────────────────────────────

/**
 * Get the root directory of an installed pack by name.
 */
export function resolveInstalledPackRoot(name: string): string {
  const dir = resolve(packsDir(), name);
  if (!existsSync(dir)) {
    throw new Error(`Pack '${name}' is not installed. Run \`agenticflow pack install\` first.`);
  }
  return dir;
}

// ───────────────────────────────────────────────────────────────────
// Read install manifest
// ───────────────────────────────────────────────────────────────────

/**
 * Read the .install.json from an installed pack.
 */
export function readInstallManifest(name: string): PackInstallManifest | null {
  const packRoot = resolve(packsDir(), name);
  const installFile = join(packRoot, ".install.json");
  if (!existsSync(installFile)) return null;
  try {
    return JSON.parse(readFileSync(installFile, "utf-8")) as PackInstallManifest;
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────
// Uninstall
// ───────────────────────────────────────────────────────────────────

/**
 * Uninstall a pack by name.
 * Optionally delete provisioned workflows from the cloud.
 */
export async function uninstallPack(
  name: string,
  client?: AgenticFlowClient | null,
  options?: { deleteCloudWorkflows?: boolean; workspaceId?: string },
): Promise<PackUninstallResult> {
  const packRoot = resolveInstalledPackRoot(name);
  const deletedWorkflows: string[] = [];

  // Optionally delete provisioned cloud workflows
  if (client && options?.deleteCloudWorkflows) {
    const manifest = readInstallManifest(name);
    if (manifest) {
      const allIds = [
        ...Object.values(manifest.provisioned_skills),
        ...Object.values(manifest.provisioned_entrypoints),
      ];
      for (const id of allIds) {
        try {
          await client.workflows.delete(id, options.workspaceId);
          deletedWorkflows.push(id);
        } catch {
          // ignore deletion errors (workflow may already be deleted)
        }
      }
    }
  }

  // Remove directory
  rmSync(packRoot, { recursive: true, force: true });

  return {
    name,
    path: packRoot,
    deleted_cloud_workflows: deletedWorkflows,
  };
}

// ───────────────────────────────────────────────────────────────────
// Get all installed pack roots (for skill resolution)
// ───────────────────────────────────────────────────────────────────

/**
 * Return absolute paths for all installed pack directories.
 */
export function allInstalledPackRoots(): string[] {
  const dir = packsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((entry) => join(dir, entry))
    .filter((p) => statSync(p).isDirectory());
}

// ───────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────

function extractId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const rec = payload as Record<string, unknown>;
  for (const key of ["id", "workflow_id"]) {
    const val = rec[key];
    if (typeof val === "string" && val.trim().length > 0) return val;
  }
  return null;
}

function isToolOnPath(toolName: string): boolean {
  if (!process.env.PATH) return false;
  const sep = process.platform === "win32" ? ";" : ":";
  for (const dir of process.env.PATH.split(sep)) {
    if (!dir) continue;
    const unix = resolve(dir, toolName);
    const win = resolve(dir, `${toolName}.exe`);
    if (existsSync(unix) || existsSync(win)) return true;
  }
  return false;
}
