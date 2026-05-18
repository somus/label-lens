import { describe, expect, test } from "bun:test";
import type { ResolvedDisplay } from "../../src/render/capability.ts";
import { progressBar } from "../../src/render/progress-bar.ts";

function display(color: ResolvedDisplay["color"]): ResolvedDisplay {
  return {
    color,
    banding: false,
    theme: "light",
    candidatePin: 0.4,
    layout: "auto",
    motion: false,
    sidebar: "auto",
    queuePreview: "auto",
    richGradient: false,
    labelChip: "configured",
  };
}

describe("progressBar", () => {
  test("truecolor uses block glyphs", () => {
    expect(progressBar(6, 10, 8, display("truecolor"))).toBe("█████░░░");
  });

  test("256 uses block glyphs", () => {
    expect(progressBar(6, 10, 8, display("256"))).toBe("█████░░░");
  });

  test("16-color falls back to # / -", () => {
    expect(progressBar(6, 10, 8, display("16"))).toBe("#####---");
  });

  test("mono falls back to # / -", () => {
    expect(progressBar(6, 10, 8, display("mono"))).toBe("#####---");
  });

  test("0 / N renders all-empty", () => {
    expect(progressBar(0, 10, 8, display("truecolor"))).toBe("░░░░░░░░");
    expect(progressBar(0, 10, 8, display("mono"))).toBe("--------");
  });

  test("N / N renders all-filled", () => {
    expect(progressBar(10, 10, 8, display("truecolor"))).toBe("████████");
    expect(progressBar(10, 10, 8, display("mono"))).toBe("########");
  });

  test("total = 0 renders all-empty (no divide-by-zero)", () => {
    expect(progressBar(5, 0, 8, display("truecolor"))).toBe("░░░░░░░░");
  });

  test("width = 0 returns empty string", () => {
    expect(progressBar(5, 10, 0, display("truecolor"))).toBe("");
  });

  test("filled > total clamps to full", () => {
    expect(progressBar(99, 10, 4, display("truecolor"))).toBe("████");
  });

  test("filled < 0 clamps to empty", () => {
    expect(progressBar(-5, 10, 4, display("truecolor"))).toBe("░░░░");
  });
});
