import { describe, it, expect } from "vitest";
import { CHANGELOG, getLatestChangelog, getChangelogSince } from "../src/cli/changelog.js";

describe("changelog", () => {
  describe("CHANGELOG array", () => {
    it("has at least one entry", () => {
      expect(CHANGELOG.length).toBeGreaterThan(0);
    });

    it("is sorted newest first", () => {
      for (let i = 1; i < CHANGELOG.length; i++) {
        expect(CHANGELOG[i - 1]!.version).not.toBe(CHANGELOG[i]!.version);
      }
    });

    it("has consistent entry structure", () => {
      for (const entry of CHANGELOG) {
        expect(entry).toHaveProperty("version");
        expect(entry).toHaveProperty("date");
        expect(entry).toHaveProperty("highlights");
        expect(entry).toHaveProperty("for_ai");
        expect(Array.isArray(entry.highlights)).toBe(true);
        expect(Array.isArray(entry.for_ai)).toBe(true);
        expect(entry.highlights.length).toBeGreaterThan(0);
        expect(entry.for_ai.length).toBeGreaterThan(0);
      }
    });

    it("has valid version strings", () => {
      for (const entry of CHANGELOG) {
        expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
      }
    });

    it("has valid date strings", () => {
      for (const entry of CHANGELOG) {
        expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });

  describe("getLatestChangelog", () => {
    it("returns the first (newest) entry", () => {
      const latest = getLatestChangelog();
      expect(latest).toBe(CHANGELOG[0]);
    });

    it("returns the correct version", () => {
      const latest = getLatestChangelog();
      expect(latest.version).toBe("1.10.5");
    });
  });

  describe("getChangelogSince", () => {
    it("returns entries newer than the given version", () => {
      const since = getChangelogSince("1.0.0");
      expect(since.length).toBeGreaterThan(0);
      expect(since[0]).toBe(CHANGELOG[0]);
    });

    it("returns only the latest entry when given the latest version", () => {
      const since = getChangelogSince("1.10.5");
      // When version is found at index 0, returns [CHANGELOG[0]]
      expect(since.length).toBe(1);
      expect(since[0]!.version).toBe("1.10.5");
    });

    it("returns only the latest entry for non-existent version (before all)", () => {
      const since = getChangelogSince("0.0.1");
      expect(since.length).toBe(1);
      expect(since[0]!.version).toBe("1.10.5");
    });

    it("returns entries between two known versions", () => {
      const since = getChangelogSince("1.9.0");
      expect(since.length).toBeGreaterThan(0);
      expect(since[0]).toBe(CHANGELOG[0]);
      // Should not include 1.9.0 itself
      expect(since.find((e) => e.version === "1.9.0")).toBeUndefined();
    });
  });
});
