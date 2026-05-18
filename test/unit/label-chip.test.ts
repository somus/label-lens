import { describe, expect, test } from "bun:test";
import { labelChipText } from "../../src/render/label-chip.ts";

describe("labelChipText", () => {
  test("configured mode: key wins over positional digit", () => {
    expect(labelChipText({ index: 0, key: "f", mode: "configured" })).toBe("[f]");
  });

  test("configured mode: no key → positional digit", () => {
    expect(labelChipText({ index: 1, key: null, mode: "configured" })).toBe("[2]");
  });

  test("configured mode: no key beyond position 9 → empty", () => {
    expect(labelChipText({ index: 9, key: null, mode: "configured" })).toBe("");
  });

  test("configured mode: key beyond position 9 still renders", () => {
    expect(labelChipText({ index: 10, key: "z", mode: "configured" })).toBe("[z]");
  });

  test("both mode: digit + key merge", () => {
    expect(labelChipText({ index: 0, key: "f", mode: "both" })).toBe("[1/f]");
  });

  test("both mode: key past position 9 stays single", () => {
    expect(labelChipText({ index: 10, key: "z", mode: "both" })).toBe("[z]");
  });

  test("both mode: no key → positional digit", () => {
    expect(labelChipText({ index: 1, key: null, mode: "both" })).toBe("[2]");
  });
});
