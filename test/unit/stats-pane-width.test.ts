import { describe, expect, test } from "bun:test";
import { defaultDisplay, type ResolvedDisplay } from "../../src/render/capability.ts";
import { computeStatsPaneWidth } from "../../src/screens/stats.ts";

function display(overrides: Partial<ResolvedDisplay>): ResolvedDisplay {
  return { ...defaultDisplay(), ...overrides };
}

describe("computeStatsPaneWidth", () => {
  test("sidebar visible (truecolor, width >= 120) subtracts 36", () => {
    const d = display({ color: "truecolor", sidebar: "auto" });
    expect(computeStatsPaneWidth(d, 160)).toBe(160 - 36);
    expect(computeStatsPaneWidth(d, 120)).toBe(120 - 36);
  });

  test("sidebar auto at narrow terminal collapses to base overhead", () => {
    const d = display({ color: "truecolor", sidebar: "auto" });
    expect(computeStatsPaneWidth(d, 100)).toBe(100 - 4);
  });

  test("sidebar auto at mono never shows sidebar", () => {
    const d = display({ color: "mono", sidebar: "auto" });
    expect(computeStatsPaneWidth(d, 200)).toBe(200 - 4);
  });

  test("sidebar=on forces sidebar even at mono or narrow", () => {
    expect(computeStatsPaneWidth(display({ color: "mono", sidebar: "on" }), 200)).toBe(200 - 36);
    expect(computeStatsPaneWidth(display({ color: "truecolor", sidebar: "on" }), 100)).toBe(
      100 - 36,
    );
  });

  test("sidebar=off never subtracts sidebar overhead", () => {
    const d = display({ color: "truecolor", sidebar: "off" });
    expect(computeStatsPaneWidth(d, 200)).toBe(200 - 4);
  });

  test("clamps to minimum width of 40", () => {
    const d = display({ color: "truecolor", sidebar: "on" });
    expect(computeStatsPaneWidth(d, 50)).toBe(40);
    expect(computeStatsPaneWidth(d, 30)).toBe(40);
  });

  test("256-color enables sidebar at >= 120 cols", () => {
    const d = display({ color: "256", sidebar: "auto" });
    expect(computeStatsPaneWidth(d, 140)).toBe(140 - 36);
  });

  test("16-color does not enable sidebar at auto", () => {
    const d = display({ color: "16", sidebar: "auto" });
    expect(computeStatsPaneWidth(d, 200)).toBe(200 - 4);
  });
});
