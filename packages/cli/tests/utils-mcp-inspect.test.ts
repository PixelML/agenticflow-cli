import { describe, expect, it } from "vitest";
import { inspectMcpToolsPattern } from "../src/cli/utils/mcp-inspect.js";

const instructionOnlyTool = (name: string) => ({
  name,
  inputSchema: {
    type: "object",
    properties: {
      instruction: { type: "string" },
    },
  },
});

const structuredTool = (name: string, props: Record<string, unknown>) => ({
  name,
  inputSchema: {
    type: "object",
    properties: props,
  },
});

describe("inspectMcpToolsPattern", () => {
  it("classifies an all-instruction client as Pipedream", () => {
    const report = inspectMcpToolsPattern([
      instructionOnlyTool("google_sheets-list-worksheets"),
      instructionOnlyTool("google_sheets-new-spreadsheet"),
      instructionOnlyTool("google_sheets-add-single-row"),
    ]);
    expect(report.pattern).toBe("pipedream");
    expect(report.pipedreamTools).toHaveLength(3);
    expect(report.writeCapable).toContain("google_sheets-add-single-row");
    expect(report.writeCapable).toContain("google_sheets-new-spreadsheet");
    expect(report.quirks.length).toBeGreaterThanOrEqual(1);
    expect(report.quirks[0]).toMatch(/configure_props/);
  });

  it("classifies a structured-schema client as Composio", () => {
    const report = inspectMcpToolsPattern([
      structuredTool("GOOGLESHEETS_CREATE_GOOGLE_SHEET1", {
        title: { type: "string" },
        sheets: { type: "array" },
      }),
      structuredTool("GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND", {
        spreadsheetId: { type: "string" },
        range: { type: "string" },
        values: { type: "array" },
      }),
    ]);
    expect(report.pattern).toBe("composio");
    expect(report.pipedreamTools).toHaveLength(0);
    expect(report.writeCapable).toContain("GOOGLESHEETS_CREATE_GOOGLE_SHEET1");
    expect(report.writeCapable).toContain("GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND");
    expect(report.quirks).toHaveLength(0);
  });

  it("classifies a mix as mixed and warns", () => {
    const report = inspectMcpToolsPattern([
      instructionOnlyTool("google_sheets-read-rows"),
      structuredTool("GOOGLESHEETS_VALUES_UPDATE", { spreadsheetId: { type: "string" } }),
    ]);
    expect(report.pattern).toBe("mixed");
    expect(report.quirks[0]).toMatch(/mixes Pipedream-style and Composio-style/);
  });

  it("returns unknown for an empty tool list", () => {
    const report = inspectMcpToolsPattern([]);
    expect(report.pattern).toBe("unknown");
    expect(report.writeCapable).toHaveLength(0);
    expect(report.pipedreamTools).toHaveLength(0);
  });

  it("does not warn about a read-only Pipedream client", () => {
    const report = inspectMcpToolsPattern([
      instructionOnlyTool("google_sheets-list-worksheets"),
      instructionOnlyTool("google_sheets-get-spreadsheet-info"),
    ]);
    expect(report.pattern).toBe("pipedream");
    // No write-capable tools, so no quirk warning
    expect(report.quirks).toHaveLength(0);
  });

  // -- WRITE_VERB_PATTERNS coverage --

  it("detects 'upsert' as write-capable", () => {
    const report = inspectMcpToolsPattern([structuredTool("db_upsert_record", { id: { type: "string" } })]);
    expect(report.writeCapable).toContain("db_upsert_record");
  });

  it("detects 'remove' as write-capable", () => {
    const report = inspectMcpToolsPattern([structuredTool("db_remove_record", { id: { type: "string" } })]);
    expect(report.writeCapable).toContain("db_remove_record");
  });

  it("detects 'replace' as write-capable", () => {
    const report = inspectMcpToolsPattern([structuredTool("db_replace_record", { id: { type: "string" } })]);
    expect(report.writeCapable).toContain("db_replace_record");
  });

  it("detects 'clear' as write-capable", () => {
    const report = inspectMcpToolsPattern([structuredTool("cache_clear", {})]);
    expect(report.writeCapable).toContain("cache_clear");
  });

  it("detects 'merge' as write-capable", () => {
    const report = inspectMcpToolsPattern([structuredTool("pr_merge", { branch: { type: "string" } })]);
    expect(report.writeCapable).toContain("pr_merge");
  });

  it("detects 'new-' prefix as write-capable", () => {
    const report = inspectMcpToolsPattern([structuredTool("docs_new-document", { title: { type: "string" } })]);
    expect(report.writeCapable).toContain("docs_new-document");
  });

  it("does NOT match 'renew' or 'newer' as write verbs", () => {
    const report = inspectMcpToolsPattern([
      structuredTool("subscription_renew", {}),
      structuredTool("get_newer_items", {}),
    ]);
    expect(report.writeCapable).not.toContain("subscription_renew");
    expect(report.writeCapable).not.toContain("get_newer_items");
  });

  // -- edge cases --

  it("handles tools with no inputSchema", () => {
    const report = inspectMcpToolsPattern([{ name: "no-schema-tool" }]);
    // No inputSchema => treated as composio (not instruction-only), no props
    expect(report.pattern).toBe("composio");
    expect(report.pipedreamTools).toHaveLength(0);
  });

  it("handles tools with empty properties", () => {
    const report = inspectMcpToolsPattern([{
      name: "empty-props",
      inputSchema: { properties: {} },
    }]);
    expect(report.pattern).toBe("composio");
    expect(report.pipedreamTools).toHaveLength(0);
  });

  it("handles tools with missing name gracefully", () => {
    const report = inspectMcpToolsPattern([{
      inputSchema: { properties: { instruction: { type: "string" } } },
    }]);
    expect(report.pattern).toBe("unknown");
    expect(report.pipedreamTools).toHaveLength(0);
    expect(report.writeCapable).toHaveLength(0);
  });

  it("handles tools with non-string name gracefully", () => {
    const report = inspectMcpToolsPattern([{
      name: 123,
      inputSchema: { properties: { instruction: { type: "string" } } },
    }]);
    expect(report.pattern).toBe("unknown");
    expect(report.pipedreamTools).toHaveLength(0);
  });

  it("Pipedream quirk includes tool count and risky count", () => {
    const report = inspectMcpToolsPattern([
      instructionOnlyTool("google_sheets-list"),
      instructionOnlyTool("google_sheets-add-row"),
      instructionOnlyTool("google_sheets-update-row"),
      instructionOnlyTool("google_sheets-delete-row"),
    ]);
    // 4 total pipedream tools, 3 are write-capable (risky)
    expect(report.quirks[0]).toMatch(/4 tool\(s\)/);
    expect(report.quirks[0]).toMatch(/3 detected/);
  });

  it("mixed pattern warns about Composio preference", () => {
    const report = inspectMcpToolsPattern([
      instructionOnlyTool("read-only-tool"),
      structuredTool("WRITE_DATA", { value: { type: "string" } }),
    ]);
    expect(report.quirks[0]).toMatch(/Prefer the Composio tools for writes/);
  });

  it("returns report with all fields present even when empty", () => {
    const report = inspectMcpToolsPattern([]);
    expect(report).toHaveProperty("pattern");
    expect(report).toHaveProperty("writeCapable");
    expect(report).toHaveProperty("pipedreamTools");
    expect(report).toHaveProperty("quirks");
  });
});
