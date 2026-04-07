/**
 * platform-catalog.ts
 *
 * Client-injection module for the GitHub PixelML/skills platform catalog.
 * Both `af skill list --platform` (Plan 02) and `af pack search` (Plan 03)
 * consume this module. No HTTP calls live outside this file.
 *
 * Data source: https://github.com/PixelML/skills
 *   - Pack catalog:  GitHub Tree API → parallel raw.githubusercontent.com fetches
 *   - Skill catalog: extracted from each pack's pack.yaml skills[] list
 *
 * Security notes (threat model T-05-01 through T-05-05):
 *   - GITHUB_TOKEN is never logged or included in error messages
 *   - YAML responses are treated as unknown and field-narrowed before use
 *   - 403/429 → typed PlatformCatalogError, no retry storm
 *   - yamlParse is safe-mode by default (no JS-YAML !!js/* tags)
 */

import { parse as yamlParse } from "yaml";

// ───────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────

export interface PlatformPack {
  /** Pack directory name, e.g. "security-pack" */
  name: string;
  /** From pack.yaml description field */
  description: string;
  /** Number of skills listed in pack.yaml */
  skill_count: number;
  version?: string;
  /** Accepted by parsePackSource() — e.g. "github:PixelML/skills/packs/security-pack" */
  install_source: string;
  _links: {
    /** https://github.com/PixelML/skills/tree/main/packs/<name> */
    browse: string;
  };
}

export interface PlatformSkill {
  /** Skill name */
  name: string;
  /** Skill description */
  description: string;
  /** Owning pack name */
  pack: string;
}

export class PlatformCatalogError extends Error {
  code: "RATE_LIMITED" | "NETWORK" | "PARSE" | "NOT_FOUND";
  hint: string;

  constructor(
    code: PlatformCatalogError["code"],
    message: string,
    hint: string,
  ) {
    super(message);
    this.name = "PlatformCatalogError";
    this.code = code;
    this.hint = hint;
  }
}

// ───────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────

const TREE_API_URL =
  "https://api.github.com/repos/PixelML/skills/git/trees/main?recursive=1";

const PACKS_BROWSE_BASE = "https://github.com/PixelML/skills/tree/main/packs";

const RATE_LIMIT_HINT = `Visit ${PACKS_BROWSE_BASE} to browse packs, or set GITHUB_TOKEN env var to raise rate limits`;

// ───────────────────────────────────────────────────────────────────
// Internal types for YAML parsing (treated as unknown, then narrowed)
// ───────────────────────────────────────────────────────────────────

interface RawPackYaml {
  name?: unknown;
  description?: unknown;
  version?: unknown;
  skills?: unknown;
}

interface RawSkillEntry {
  name?: unknown;
  description?: unknown;
}

// ───────────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────────

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    // GITHUB_TOKEN hint: token is never logged or included in error messages (T-05-02)
    "User-Agent": "agenticflow-cli",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Narrow a raw YAML skills[] entry to name + description strings.
 * Handles both object form `{ name: "...", description: "..." }` and
 * plain string form `"skill-name"` (as found in real pack.yaml files).
 */
function normalizeSkillEntry(entry: unknown): { name: string; description: string } | null {
  if (typeof entry === "string" && entry.trim().length > 0) {
    return { name: entry.trim(), description: "" };
  }
  if (typeof entry === "object" && entry !== null) {
    const raw = entry as RawSkillEntry;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) return null;
    const description = typeof raw.description === "string" ? raw.description.trim() : "";
    return { name, description };
  }
  return null;
}

/**
 * Internal result of fetching and parsing all pack.yaml files.
 */
interface PackYamlResult {
  pack: PlatformPack;
  skills: PlatformSkill[];
}

/**
 * Core implementation: fetches the GitHub tree, then parallel-fetches all
 * pack.yaml files. Returns parsed pack data + extracted skills.
 *
 * This shared helper avoids double-fetching when both fetchPlatformPacks()
 * and fetchPlatformSkills() are called by the same consumer.
 */
async function _fetchAllPackYaml(opts?: { token?: string }): Promise<PackYamlResult[]> {
  const headers = buildHeaders(opts?.token);

  // Step 1: Fetch the full Git tree (1 GitHub API call)
  let treeRes: Response;
  try {
    treeRes = await fetch(TREE_API_URL, { headers });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PlatformCatalogError(
      "NETWORK",
      `Network error fetching platform catalog: ${msg}`,
      "Check your internet connection or visit https://github.com/PixelML/skills/tree/main/packs",
    );
  }

  // Step 2: Handle rate limit responses
  if (treeRes.status === 403 || treeRes.status === 429) {
    throw new PlatformCatalogError(
      "RATE_LIMITED",
      `GitHub API rate limit hit (status ${treeRes.status})`,
      RATE_LIMIT_HINT,
    );
  }

  if (!treeRes.ok) {
    throw new PlatformCatalogError(
      "NOT_FOUND",
      `GitHub Tree API returned status ${treeRes.status}`,
      `Visit ${PACKS_BROWSE_BASE}`,
    );
  }

  // Step 3: Parse tree response
  let treeData: { tree: Array<{ path: string; type: string }> };
  try {
    treeData = (await treeRes.json()) as { tree: Array<{ path: string; type: string }> };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PlatformCatalogError(
      "PARSE",
      `Failed to parse GitHub Tree API response: ${msg}`,
      `Visit ${PACKS_BROWSE_BASE}`,
    );
  }

  // Step 4: Filter for pack.yaml entries only — pattern: packs/<name>/pack.yaml
  const packYamlRegex = /^packs\/([^/]+)\/pack\.yaml$/;
  const packEntries: Array<{ name: string; rawUrl: string }> = [];

  for (const entry of treeData.tree ?? []) {
    if (entry.type !== "blob") continue;
    const match = packYamlRegex.exec(entry.path);
    if (!match) continue;
    const name = match[1];
    packEntries.push({
      name,
      rawUrl: `https://raw.githubusercontent.com/PixelML/skills/main/packs/${name}/pack.yaml`,
    });
  }

  if (packEntries.length === 0) {
    return [];
  }

  // Step 5: Parallel-fetch all pack.yaml files (raw.githubusercontent.com — no rate limit)
  const results = await Promise.all(
    packEntries.map(async ({ name, rawUrl }): Promise<PackYamlResult | null> => {
      try {
        const rawRes = await fetch(rawUrl, {
          headers: {
            "User-Agent": "agenticflow-cli",
            // No GitHub API auth headers needed for raw.githubusercontent.com
          },
        });
        if (!rawRes.ok) {
          // Skip packs that fail to fetch rather than failing the whole batch
          return null;
        }
        const text = await rawRes.text();

        // Step 6: Parse YAML — treat result as unknown, narrow each field (T-05-01, T-05-05)
        let parsed: RawPackYaml;
        try {
          parsed = (yamlParse(text) ?? {}) as RawPackYaml;
        } catch {
          // Skip malformed packs rather than crashing (T-05-01)
          return null;
        }

        // Narrow each field explicitly before constructing PlatformPack (T-05-05)
        const description =
          typeof parsed.description === "string" ? parsed.description.trim() : "";
        const version =
          typeof parsed.version === "string" ? parsed.version.trim() : undefined;

        // Extract skills[] — handles both string and object entries
        const rawSkills = Array.isArray(parsed.skills) ? parsed.skills : [];
        const skills: PlatformSkill[] = [];
        for (const entry of rawSkills) {
          const normalized = normalizeSkillEntry(entry);
          if (normalized) {
            skills.push({ ...normalized, pack: name });
          }
        }

        const pack: PlatformPack = {
          name,
          description,
          skill_count: skills.length,
          version,
          install_source: `github:PixelML/skills/packs/${name}`,
          _links: {
            browse: `https://github.com/PixelML/skills/tree/main/packs/${name}`,
          },
        };

        return { pack, skills };
      } catch {
        // Skip packs that fail for any reason
        return null;
      }
    }),
  );

  return results.filter((r): r is PackYamlResult => r !== null);
}

// ───────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────

/**
 * Fetch all platform pack metadata from the PixelML/skills GitHub repo.
 *
 * Makes 1 GitHub Tree API call + N parallel raw.githubusercontent.com fetches.
 * Optional GITHUB_TOKEN passed via opts.token raises rate limits.
 *
 * @throws {PlatformCatalogError} with code RATE_LIMITED (403/429), NETWORK, PARSE, or NOT_FOUND
 */
export async function fetchPlatformPacks(opts?: { token?: string }): Promise<PlatformPack[]> {
  const results = await _fetchAllPackYaml(opts);
  return results.map((r) => r.pack);
}

/**
 * Fetch all platform skills flattened across all packs.
 *
 * Internally calls _fetchAllPackYaml() — same cost as fetchPlatformPacks().
 *
 * @throws {PlatformCatalogError} with code RATE_LIMITED (403/429), NETWORK, PARSE, or NOT_FOUND
 */
export async function fetchPlatformSkills(opts?: { token?: string }): Promise<PlatformSkill[]> {
  const results = await _fetchAllPackYaml(opts);
  return results.flatMap((r) => r.skills);
}
