import { describe, expect, test } from "bun:test";
import { splitContextLines } from "../../src/render/context-strip.ts";

describe("splitContextLines", () => {
  test("null/undefined input returns empty array", () => {
    expect(splitContextLines(null, 3, "before")).toEqual([]);
    expect(splitContextLines(undefined as unknown as string | null, 3, "after")).toEqual([]);
  });

  test("empty string returns empty array", () => {
    expect(splitContextLines("", 3, "before")).toEqual([]);
  });

  test("before: returns last n lines", () => {
    expect(splitContextLines("a\nb\nc\nd", 3, "before")).toEqual(["b", "c", "d"]);
  });

  test("after: returns first n lines", () => {
    expect(splitContextLines("x\ny\nz\nq", 3, "after")).toEqual(["x", "y", "z"]);
  });

  test("fewer than n lines: returns all", () => {
    expect(splitContextLines("a\nb", 3, "before")).toEqual(["a", "b"]);
    expect(splitContextLines("a\nb", 3, "after")).toEqual(["a", "b"]);
  });

  test("strips trailing empty lines (newline at end)", () => {
    expect(splitContextLines("a\nb\nc\n", 3, "before")).toEqual(["a", "b", "c"]);
    expect(splitContextLines("a\nb\nc\n\n", 3, "after")).toEqual(["a", "b", "c"]);
  });

  test("n=0 returns empty array", () => {
    expect(splitContextLines("a\nb\nc", 0, "before")).toEqual([]);
  });
});
