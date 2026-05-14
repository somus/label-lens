import { describe, expect, test } from "bun:test";
import type { ResolvedDisplay } from "../../src/render/capability.ts";
import { progressSegments } from "../../src/render/progress-segments.ts";

function display(color: ResolvedDisplay["color"]): ResolvedDisplay {
  return {
    color,
    banding: false,
    theme: "light",
    candidatePin: 0.4,
    layout: "auto",
    motion: false,
  };
}

describe("progressSegments", () => {
  test("nonzero filled renders [bar] count% with bar accent", () => {
    const segs = progressSegments(3, 10, 8, display("truecolor"));
    const joined = segs.map((s) => s.text).join("");
    expect(joined).toBe("[██░░░░░░]  30%");
    const bar = segs.find((s) => s.text.includes("█"));
    expect(bar?.tone).toBe("accent");
  });

  test("zero filled renders empty bar with dim tone", () => {
    const segs = progressSegments(0, 10, 8, display("truecolor"));
    const joined = segs.map((s) => s.text).join("");
    expect(joined).toBe("[░░░░░░░░]   0%");
    const bar = segs.find((s) => s.text.includes("░"));
    expect(bar?.tone).toBe("dim");
  });

  test("mono still produces brackets and ASCII chars", () => {
    const segs = progressSegments(5, 10, 4, display("mono"));
    const joined = segs.map((s) => s.text).join("");
    expect(joined).toBe("[##--]  50%");
  });

  test("total = 0 renders 0% with empty bar", () => {
    const segs = progressSegments(0, 0, 8, display("truecolor"));
    const joined = segs.map((s) => s.text).join("");
    expect(joined).toBe("[░░░░░░░░]   0%");
  });

  test("100% pads to fixed 4-col percent slot for column alignment", () => {
    const segs = progressSegments(10, 10, 8, display("truecolor"));
    const joined = segs.map((s) => s.text).join("");
    expect(joined).toBe("[████████] 100%");
  });

  test("percent slot always 4 chars regardless of value (column alignment)", () => {
    const lengths = [0, 5, 50, 95, 100].map(
      (n) => progressSegments(n, 100, 8, display("truecolor")).slice(-1)[0]!.text.length,
    );
    expect(new Set(lengths).size).toBe(1);
    expect(lengths[0]).toBe(4);
  });
});
