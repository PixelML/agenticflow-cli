import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchPlatformPacks,
  fetchPlatformSkills,
  PlatformCatalogError,
} from "../src/cli/platform-catalog.js";

// ───────────────────────────────────────────────────────────────────
// Mock helpers
// ───────────────────────────────────────────────────────────────────

const TREE_API_URL =
  "https://api.github.com/repos/PixelML/skills/git/trees/main?recursive=1";

function makeRawUrl(name: string): string {
  return `https://raw.githubusercontent.com/PixelML/skills/main/packs/${name}/pack.yaml`;
}

function makeTreeResponse(packNames: string[]): object {
  return {
    tree: [
      // pack.yaml entries — the ones we care about
      ...packNames.map((name) => ({
        path: `packs/${name}/pack.yaml`,
        type: "blob",
        sha: "abc",
        url: makeRawUrl(name),
      })),
      // A noise entry that should be ignored
      { path: "packs/security-pack/skills/threat-model/skill.yaml", type: "blob", sha: "def", url: "" },
      { path: "agenticflow-skills/search/SKILL.md", type: "blob", sha: "xyz", url: "" },
    ],
    truncated: false,
  };
}

function makePackYaml(name: string, skillNames: string[], description?: string): string {
  const skills = skillNames.map((s) => `  - name: ${s}\n    description: Skill ${s}`).join("\n");
  return [
    `name: ${name}`,
    `description: ${description ?? `${name} description`}`,
    `version: 1.0.0`,
    `skills:`,
    skills,
  ].join("\n");
}

function mockFetch(responses: Map<string, { status: number; body: string | object; ok?: boolean }>) {
  return vi.fn().mockImplementation((url: string) => {
    const entry = responses.get(url);
    if (!entry) {
      return Promise.resolve({
        ok: false,
        status: 404,
        text: () => Promise.resolve(""),
        json: () => Promise.reject(new Error("not found")),
      });
    }
    const ok = entry.ok !== undefined ? entry.ok : entry.status >= 200 && entry.status < 300;
    return Promise.resolve({
      ok,
      status: entry.status,
      text: () =>
        Promise.resolve(
          typeof entry.body === "string" ? entry.body : JSON.stringify(entry.body),
        ),
      json: () =>
        Promise.resolve(
          typeof entry.body === "string" ? JSON.parse(entry.body) : entry.body,
        ),
    });
  });
}

// ───────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────

describe("fetchPlatformPacks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Test 1: returns PlatformPack[] when GitHub Tree API returns 18 pack.yaml paths", async () => {
    const packs = [
      "security-pack",
      "marketing-pack",
      "content-creator-pack",
      "amazon-seller-pack",
      "data-analysis-pack",
      "customer-support-pack",
      "devops-pack",
      "finance-pack",
      "hr-pack",
      "legal-pack",
      "product-pack",
      "project-manager-pack",
      "research-pack",
      "sales-pack",
      "social-media-pack",
      "seo-pack",
      "writing-pack",
      "education-pack",
    ];

    const responses = new Map<string, { status: number; body: string | object; ok?: boolean }>();
    responses.set(TREE_API_URL, { status: 200, body: makeTreeResponse(packs) });
    for (const name of packs) {
      responses.set(makeRawUrl(name), {
        status: 200,
        body: makePackYaml(name, ["skill-a", "skill-b"], `${name} description`),
      });
    }

    vi.stubGlobal("fetch", mockFetch(responses));

    const result = await fetchPlatformPacks();

    expect(result).toHaveLength(18);
    const first = result[0];
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("description");
    expect(first).toHaveProperty("skill_count");
    expect(first).toHaveProperty("install_source");
    expect(first).toHaveProperty("_links");
    expect(first._links).toHaveProperty("browse");
  });

  it("Test 2: install_source and _links.browse have the correct format", async () => {
    const packName = "security-pack";
    const responses = new Map<string, { status: number; body: string | object; ok?: boolean }>();
    responses.set(TREE_API_URL, {
      status: 200,
      body: makeTreeResponse([packName]),
    });
    responses.set(makeRawUrl(packName), {
      status: 200,
      body: makePackYaml(packName, ["scan-vulnerabilities", "audit-deps"]),
    });

    vi.stubGlobal("fetch", mockFetch(responses));

    const result = await fetchPlatformPacks();

    expect(result).toHaveLength(1);
    expect(result[0].install_source).toBe(`github:PixelML/skills/packs/${packName}`);
    expect(result[0]._links.browse).toBe(
      `https://github.com/PixelML/skills/tree/main/packs/${packName}`,
    );
    expect(result[0].skill_count).toBe(2);
  });

  it("Test 4: throws PlatformCatalogError RATE_LIMITED on 403", async () => {
    const responses = new Map<string, { status: number; body: string | object; ok?: boolean }>();
    responses.set(TREE_API_URL, { status: 403, body: "rate limited", ok: false });

    vi.stubGlobal("fetch", mockFetch(responses));

    await expect(fetchPlatformPacks()).rejects.toThrow(PlatformCatalogError);
    await expect(fetchPlatformPacks()).rejects.toMatchObject({
      code: "RATE_LIMITED",
      hint: expect.stringContaining("https://github.com/PixelML/skills/tree/main/packs"),
    });
  });

  it("Test 5: throws PlatformCatalogError RATE_LIMITED on 429", async () => {
    const responses = new Map<string, { status: number; body: string | object; ok?: boolean }>();
    responses.set(TREE_API_URL, { status: 429, body: "rate limited", ok: false });

    vi.stubGlobal("fetch", mockFetch(responses));

    await expect(fetchPlatformPacks()).rejects.toThrow(PlatformCatalogError);
    await expect(fetchPlatformPacks()).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("Test 6: throws PlatformCatalogError NETWORK when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("fetch failed: connection refused")),
    );

    await expect(fetchPlatformPacks()).rejects.toThrow(PlatformCatalogError);
    await expect(fetchPlatformPacks()).rejects.toMatchObject({
      code: "NETWORK",
    });
  });

  it("Test 7: empty tree response yields empty array with no throw", async () => {
    const responses = new Map<string, { status: number; body: string | object; ok?: boolean }>();
    responses.set(TREE_API_URL, {
      status: 200,
      body: { tree: [], truncated: false },
    });

    vi.stubGlobal("fetch", mockFetch(responses));

    const result = await fetchPlatformPacks();
    expect(result).toEqual([]);
  });
});

describe("fetchPlatformSkills", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Test 3: flattens all skills across all packs; known skill appears with owning pack", async () => {
    const responses = new Map<string, { status: number; body: string | object; ok?: boolean }>();
    responses.set(TREE_API_URL, {
      status: 200,
      body: makeTreeResponse(["security-pack", "marketing-pack"]),
    });
    responses.set(makeRawUrl("security-pack"), {
      status: 200,
      body: makePackYaml("security-pack", ["scan-vulnerabilities", "code-audit"]),
    });
    responses.set(makeRawUrl("marketing-pack"), {
      status: 200,
      body: makePackYaml("marketing-pack", ["write-ad-copy", "generate-campaign"]),
    });

    vi.stubGlobal("fetch", mockFetch(responses));

    const skills = await fetchPlatformSkills();

    expect(skills.length).toBe(4);

    const known = skills.find((s) => s.name === "scan-vulnerabilities");
    expect(known).toBeDefined();
    expect(known!.pack).toBe("security-pack");
    expect(known).toHaveProperty("description");
  });
});
