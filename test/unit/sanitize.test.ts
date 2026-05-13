import { describe, expect, test } from "bun:test";
import { sanitizeStatusText } from "../../src/render/sanitize.ts";

describe("sanitizeStatusText", () => {
  test("passes through plain text untouched", () => {
    expect(sanitizeStatusText("doc-42")).toBe("doc-42");
    expect(sanitizeStatusText("food · travel")).toBe("food · travel");
  });

  test("strips newlines and carriage returns", () => {
    expect(sanitizeStatusText("doc\nA")).toBe("doc A");
    expect(sanitizeStatusText("a\r\nb")).toBe("a  b");
  });

  test("strips ASCII control characters", () => {
    expect(sanitizeStatusText("foo\x00bar")).toBe("foo bar");
    expect(sanitizeStatusText("\x1b[31mred\x1b[0m")).toBe(" [31mred [0m");
    expect(sanitizeStatusText("tab\there")).toBe("tab here");
    expect(sanitizeStatusText("del\x7f")).toBe("del ");
  });

  test("preserves multi-byte unicode (non-control)", () => {
    expect(sanitizeStatusText("→ ● 🚀")).toBe("→ ● 🚀");
  });
});
