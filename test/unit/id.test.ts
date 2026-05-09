import { describe, expect, test } from "bun:test";
import { contentHashId, normalize } from "../../src/ingest/id.ts";

describe("normalize", () => {
  test("lowercases", () => {
    expect(normalize("Hello World")).toBe("hello world");
  });
  test("collapses whitespace", () => {
    expect(normalize("a   b\t\tc\n d")).toBe("a b c d");
  });
  test("trims", () => {
    expect(normalize("   x   ")).toBe("x");
  });
});

describe("contentHashId", () => {
  test("returns a 64-char hex sha256", () => {
    const id = contentHashId("hello");
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  test("identical text + context produce identical IDs", () => {
    expect(contentHashId("Foo", "before", "after")).toBe(
      contentHashId("foo", "BEFORE", "  after  "),
    );
  });

  test("different context produces different IDs", () => {
    const a = contentHashId("same line", "doc A", null);
    const b = contentHashId("same line", "doc B", null);
    expect(a).not.toBe(b);
  });

  test("missing context vs empty string normalize identically", () => {
    expect(contentHashId("x")).toBe(contentHashId("x", "", ""));
    expect(contentHashId("x", null, null)).toBe(contentHashId("x"));
  });

  test("text edits produce different IDs (orphan-on-edit per ADR 0001)", () => {
    const a = contentHashId("Senior Software Engineer at Acme");
    const b = contentHashId("Senior Software Engineer at Acme Corp");
    expect(a).not.toBe(b);
  });

  test("unit-separator prevents adjacent-field collisions", () => {
    expect(contentHashId("ab", "c")).not.toBe(contentHashId("a", "bc"));
  });
});
