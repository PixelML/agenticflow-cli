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
 */

// ───────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────

export interface PlatformPack {
  name: string;
  description: string;
  skill_count: number;
  version?: string;
  install_source: string;
  _links: {
    browse: string;
  };
}

export interface PlatformSkill {
  name: string;
  description: string;
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
// Public API (stubs — throw until implemented in Task 2)
// ───────────────────────────────────────────────────────────────────

export function fetchPlatformPacks(
  _opts?: { token?: string },
): Promise<PlatformPack[]> {
  throw new Error("not implemented");
}

export function fetchPlatformSkills(
  _opts?: { token?: string },
): Promise<PlatformSkill[]> {
  throw new Error("not implemented");
}
