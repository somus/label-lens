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
    // Both `a*c` and `a*` have the same non-wildcard prefix length (1, the
    // leading `a`) and both match `aXc`, so the tie-break must fall to config
    // order. Confirm each pattern matches in isolation first so the tie-break
    // assertion can't accidentally pass just because the second pattern
    // doesn't actually match.
    expect(
      resolveThreshold("aXc", {
        default: 0.5,
        bySource: [{ pattern: "a*c", threshold: 0.1 }],
      }),
    ).toBe(0.1);
    expect(
      resolveThreshold("aXc", {
        default: 0.5,
        bySource: [{ pattern: "a*", threshold: 0.2 }],
      }),
    ).toBe(0.2);
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

  test("consecutive `*` collapses to a single wildcard (no validation pass)", () => {
    // Single-`*` is the documented grammar; consecutive `*` patterns shouldn't
    // appear in real configs. Pin current behavior: the matcher splits on `*`
    // and skips empty parts, so `a**b` matches like `a*b`. If we ever add a
    // pattern validator, update this test to assert rejection instead.
    expect(
      resolveThreshold("aXb", {
        default: 0.5,
        bySource: [{ pattern: "a**b", threshold: 0.1 }],
      }),
    ).toBe(0.1);
    expect(
      resolveThreshold("ab", {
        default: 0.5,
        bySource: [{ pattern: "a**b", threshold: 0.1 }],
      }),
    ).toBe(0.1);
    expect(
      resolveThreshold("aX", {
        default: 0.5,
        bySource: [{ pattern: "a**b", threshold: 0.1 }],
      }),
    ).toBe(0.5);
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
