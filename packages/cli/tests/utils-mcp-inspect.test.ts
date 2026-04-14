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
});
