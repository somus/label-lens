import { describe, expect, test } from "bun:test";
import { lerpOklab } from "../../src/render/oklab.ts";
import { truncateEnd, truncateMiddle } from "../../src/render/truncate.ts";

describe("truncateEnd", () => {
  test("handles zero and tiny budgets without overflowing", () => {
    expect(truncateEnd("abcdef", 0)).toBe("");
    expect(truncateEnd("abcdef", 1)).toBe(".");
    expect(truncateEnd("abcdef", 2)).toBe("..");
    expect(truncateEnd("abcdef", 3)).toBe("...");
  });

  test("keeps exact-fit text unchanged and appends ASCII ellipsis when truncated", () => {
    expect(truncateEnd("abcdef", 6)).toBe("abcdef");
    expect(truncateEnd("abcdef", 5)).toBe("ab...");
  });
});

describe("truncateMiddle", () => {
  test("handles zero and tiny budgets without overflowing", () => {
    expect(truncateMiddle("abcdef", 0)).toBe("");
    expect(truncateMiddle("abcdef", 2)).toBe("..");
  });

  test("keeps exact-fit text unchanged", () => {
    expect(truncateMiddle("~/data/file.jsonl", 17)).toBe("~/data/file.jsonl");
  });

  test("preserves the filename side of long paths", () => {
    const out = truncateMiddle("~/very/long/path/to/dataset.jsonl", 24);
    expect(out).toContain("...");
    expect(out.endsWith("dataset.jsonl")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(24);
  });

  test("falls back to tail-only truncation when no slash boundary is useful", () => {
    expect(truncateMiddle("abcdefghijklmnopqrstuvwxyz", 10)).toBe("...tuvwxyz");
  });
});

describe("lerpOklab", () => {
  test("returns exact endpoints at t=0 and t=1", () => {
    expect(lerpOklab("#000000", "#ffffff", 0)).toBe("#000000");
    expect(lerpOklab("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  test("clamps t outside [0, 1]", () => {
    expect(lerpOklab("#000000", "#ffffff", -1)).toBe("#000000");
    expect(lerpOklab("#000000", "#ffffff", 2)).toBe("#ffffff");
  });

  test("supports short #rgb hex inputs", () => {
    expect(lerpOklab("#0f0", "#00f", 0)).toBe("#00ff00");
    expect(lerpOklab("#0f0", "#00f", 1)).toBe("#0000ff");
  });

  test("falls back to the target color when either input is invalid", () => {
    expect(lerpOklab("not-a-color", "#123456", 0.5)).toBe("#123456");
    expect(lerpOklab("#123456", "bad", 0.5)).toBe("bad");
  });
});
