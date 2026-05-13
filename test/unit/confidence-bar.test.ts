import { describe, expect, test } from "bun:test";
import { confidenceGlyph } from "../../src/render/confidence-bar.ts";

describe("confidenceGlyph", () => {
  test("returns plain `│` for null / undefined / non-finite", () => {
    expect(confidenceGlyph(null)).toBe("│");
    expect(confidenceGlyph(undefined)).toBe("│");
    expect(confidenceGlyph(Number.NaN)).toBe("│");
    expect(confidenceGlyph(Number.POSITIVE_INFINITY)).toBe("│");
  });

  test("clamps below 0 and above 1", () => {
    expect(confidenceGlyph(-5)).toBe("▁");
    expect(confidenceGlyph(2)).toBe("█");
  });

  test("maps the 0..1 range across 8 block-element levels", () => {
    expect(confidenceGlyph(0)).toBe("▁");
    expect(confidenceGlyph(0.125)).toBe("▂");
    expect(confidenceGlyph(0.5)).toBe("▅");
    expect(confidenceGlyph(0.875)).toBe("█");
    expect(confidenceGlyph(1)).toBe("█");
  });
});
