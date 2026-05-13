import { describe, expect, test } from "bun:test";
import { parseExportArgument } from "../../src/actions/export/run.ts";

describe("parseExportArgument", () => {
  test("parses just a format", () => {
    const r = parseExportArgument("jsonl");
    expect(r.format).toBe("jsonl");
    expect(r.includeRejected).toBe(false);
    expect(r.includeOrphans).toBe(false);
    expect(r.error).toBeUndefined();
  });

  test("accepts flags in any order relative to the format", () => {
    expect(parseExportArgument("--include-rejected jsonl").format).toBe("jsonl");
    expect(parseExportArgument("jsonl --include-rejected").format).toBe("jsonl");
    expect(parseExportArgument("--include-orphans --include-rejected jsonl").format).toBe("jsonl");
  });

  test("rejects -o / --output without a following path", () => {
    expect(parseExportArgument("jsonl -o").error).toMatch(/requires a path/);
    expect(parseExportArgument("jsonl --output").error).toMatch(/requires a path/);
    expect(parseExportArgument("-o").error).toMatch(/requires a path/);
  });

  test("captures -o path with embedded spaces is single-token (callers tokenize)", () => {
    const r = parseExportArgument("jsonl -o ./out.jsonl");
    expect(r.outputPath).toBe("./out.jsonl");
  });

  test("rejects a duplicate format token", () => {
    const r = parseExportArgument("jsonl csv");
    expect(r.error).toMatch(/unknown argument/);
  });

  test("rejects unknown long flags", () => {
    expect(parseExportArgument("jsonl --bogus").error).toMatch(/unknown argument/);
  });

  test("rejects unknown formats", () => {
    expect(parseExportArgument("yaml").error).toMatch(/unknown format/);
  });

  test("returns no format when argument is empty / whitespace", () => {
    expect(parseExportArgument(undefined).format).toBeUndefined();
    expect(parseExportArgument("").format).toBeUndefined();
    expect(parseExportArgument("   ").format).toBeUndefined();
  });
});
