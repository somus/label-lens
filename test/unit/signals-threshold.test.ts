import { describe, expect, test } from "bun:test";
import { resolveThreshold } from "../../src/signals/threshold.ts";

describe("resolveThreshold", () => {
  test("falls back to default when no overrides match", () => {
    expect(resolveThreshold("regex.simple", { default: 0.5, bySource: [] })).toBe(0.5);
    expect(resolveThreshold(null, { default: 0.4, bySource: [] })).toBe(0.4);
  });

  test("exact source match beats default", () => {
    expect(
      resolveThreshold("regex.simple", {
        default: 0.5,
        bySource: [{ pattern: "regex.simple", threshold: 0.3 }],
      }),
    ).toBe(0.3);
  });

  test("glob suffix `regex.*` matches `regex.simple`", () => {
    expect(
      resolveThreshold("regex.simple", {
        default: 0.5,
        bySource: [{ pattern: "regex.*", threshold: 0.4 }],
      }),
    ).toBe(0.4);
  });

  test("glob with `*` in middle matches anchored head + tail", () => {
    expect(
      resolveThreshold("model-prod-v2", {
        default: 0.5,
        bySource: [{ pattern: "model-*-v2", threshold: 0.2 }],
      }),
    ).toBe(0.2);
  });

  test("exact match wins over glob match", () => {
    expect(
      resolveThreshold("regex.simple", {
        default: 0.5,
        bySource: [
          { pattern: "regex.*", threshold: 0.4 },
          { pattern: "regex.simple", threshold: 0.3 },
        ],
      }),
    ).toBe(0.3);
  });

  test("among globs, longer non-wildcard prefix wins", () => {
    expect(
      resolveThreshold("regex.simple.v2", {
        default: 0.5,
        bySource: [
          { pattern: "regex.*", threshold: 0.4 },
          { pattern: "regex.simple.*", threshold: 0.2 },
        ],
      }),
    ).toBe(0.2);
  });

  test("equal-specificity globs: first in config order wins", () => {
    expect(
      resolveThreshold("regex.simple", {
        default: 0.5,
        bySource: [
          { pattern: "regex.*", threshold: 0.4 },
          { pattern: "rege*", threshold: 0.3 },
        ],
      }),
      // both match; specificity = prefix length before first `*`: regex. = 6, rege = 4 → regex.* wins
    ).toBe(0.4);
  });

  test("two globs with identical prefix length: first in config order wins", () => {
    expect(
      resolveThreshold("aXc", {
        default: 0.5,
        bySource: [
          { pattern: "a*c", threshold: 0.1 },
          { pattern: "a*", threshold: 0.2 },
        ],
      }),
    ).toBe(0.1);
  });

  test("null source falls through to default even with overrides present", () => {
    expect(
      resolveThreshold(null, {
        default: 0.5,
        bySource: [{ pattern: "*", threshold: 0.1 }],
      }),
    ).toBe(0.5);
  });

  test("glob `*` matches any source string", () => {
    expect(
      resolveThreshold("anything", {
        default: 0.5,
        bySource: [{ pattern: "*", threshold: 0.1 }],
      }),
    ).toBe(0.1);
  });
});
