import { describe, expect, test } from "bun:test";
import { deriveExportPaths } from "../../src/export/paths.ts";

describe("deriveExportPaths", () => {
  test("derives sibling paths from a .jsonl output", () => {
    const paths = deriveExportPaths("./reviewed.jsonl");
    expect(paths).toEqual({
      jsonl: "./reviewed.jsonl",
      csv: "./reviewed.csv",
      reviewLog: "./reviewed.review-log.jsonl",
      stats: "./reviewed.stats.md",
    });
  });

  test("preserves directory components", () => {
    const paths = deriveExportPaths("/var/data/out.jsonl");
    expect(paths.csv).toBe("/var/data/out.csv");
    expect(paths.reviewLog).toBe("/var/data/out.review-log.jsonl");
    expect(paths.stats).toBe("/var/data/out.stats.md");
  });

  test("handles output paths without a known extension", () => {
    const paths = deriveExportPaths("./reviewed");
    expect(paths).toEqual({
      jsonl: "./reviewed.jsonl",
      csv: "./reviewed.csv",
      reviewLog: "./reviewed.review-log.jsonl",
      stats: "./reviewed.stats.md",
    });
  });
});
