import { describe, expect, test } from "bun:test";
import {
  disagreementScore,
  duplicateScore,
  lowConfidenceScore,
} from "../../src/signals/compute.ts";

describe("lowConfidenceScore", () => {
  test("normalized gap (threshold - confidence) / threshold when below threshold", () => {
    expect(lowConfidenceScore(0.3, 0.5)).toBeCloseTo(0.4, 10);
    expect(lowConfidenceScore(0.5, 0.7)).toBeCloseTo((0.7 - 0.5) / 0.7, 10);
    expect(lowConfidenceScore(0, 0.5)).toBeCloseTo(1, 10);
  });

  test("returns null when confidence is null (no measurement)", () => {
    expect(lowConfidenceScore(null, 0.5)).toBeNull();
  });

  test("returns null at the threshold (strict <)", () => {
    expect(lowConfidenceScore(0.5, 0.5)).toBeNull();
  });

  test("returns null above the threshold", () => {
    expect(lowConfidenceScore(0.8, 0.5)).toBeNull();
  });
});

describe("disagreementScore", () => {
  test("null for fewer than 2 predictions", () => {
    expect(disagreementScore([])).toBeNull();
    expect(disagreementScore(["food"])).toBeNull();
  });

  test("0 when all labels agree", () => {
    expect(disagreementScore(["food", "food"])).toBe(0);
    expect(disagreementScore(["x", "x", "x"])).toBe(0);
  });

  test("0.5 for 2 distinct labels", () => {
    expect(disagreementScore(["food", "travel"])).toBeCloseTo(0.5, 10);
  });

  test("1/3 for a 2-vs-1 split", () => {
    expect(disagreementScore(["a", "a", "b"])).toBeCloseTo(1 / 3, 10);
  });

  test("2/3 when every label is distinct in 3 preds", () => {
    expect(disagreementScore(["a", "b", "c"])).toBeCloseTo(2 / 3, 10);
  });
});

describe("duplicateScore", () => {
  test("group_size / total for small clusters", () => {
    expect(duplicateScore(2, 10000)).toBeCloseTo(0.0002, 10);
    expect(duplicateScore(50, 10000)).toBeCloseTo(0.005, 10);
  });

  test("caps at 1.0 if group exceeds total (defensive)", () => {
    expect(duplicateScore(20, 10)).toBe(1);
  });

  test("0 total returns 0 (no division-by-zero)", () => {
    expect(duplicateScore(2, 0)).toBe(0);
  });
});
