import { describe, expect, test } from "bun:test";
import { BandedRecord, focusBoxStyle, leftEdgeMarker } from "../../src/render/banded-record.ts";
import type { ResolvedDisplay } from "../../src/render/capability.ts";
import { displayFor } from "../util/display.ts";

const truecolorLight: ResolvedDisplay = displayFor({ color: "truecolor", banding: true });
const truecolorDark: ResolvedDisplay = displayFor({
  color: "truecolor",
  banding: true,
  theme: "dark",
});
const sixteenLight: ResolvedDisplay = displayFor({ color: "16" });
const monoLight: ResolvedDisplay = displayFor({ color: "mono" });

describe("focusBoxStyle", () => {
  test("truecolor / 256 → rounded", () => {
    expect(focusBoxStyle({ ...truecolorLight, color: "truecolor" })).toBe("rounded");
    expect(focusBoxStyle({ ...truecolorLight, color: "256" })).toBe("rounded");
  });

  test("16 / mono → single", () => {
    expect(focusBoxStyle(sixteenLight)).toBe("single");
    expect(focusBoxStyle(monoLight)).toBe("single");
  });
});

describe("leftEdgeMarker", () => {
  test("truecolor / 256: no marker (banding does the work)", () => {
    expect(leftEdgeMarker(truecolorLight, true)).toBeNull();
    expect(leftEdgeMarker(truecolorLight, false)).toBeNull();
  });

  test("16 / mono: ▶ for focused, │ for context", () => {
    expect(leftEdgeMarker(sixteenLight, true)).toBe("▶");
    expect(leftEdgeMarker(sixteenLight, false)).toBe("│");
    expect(leftEdgeMarker(monoLight, true)).toBe("▶");
    expect(leftEdgeMarker(monoLight, false)).toBe("│");
  });
});

type VNodeLike = {
  props?: Record<string, unknown>;
  children?: unknown[];
};

function asNode(v: unknown): VNodeLike {
  return v as VNodeLike;
}

describe("BandedRecord component", () => {
  test("focused record at truecolor: rounded border + accent borderColor on the Box", () => {
    const box = asNode(
      BandedRecord({
        text: "hello world",
        isFocused: true,
        bandSlot: "even",
        display: truecolorLight,
      }),
    );
    expect(box.props?.borderStyle).toBe("rounded");
    expect(typeof box.props?.borderColor).toBe("string");
    expect(box.props?.borderColor).not.toBe("transparent");
  });

  test("light-theme accent differs from dark-theme accent", () => {
    const light = asNode(
      BandedRecord({ text: "x", isFocused: true, bandSlot: "even", display: truecolorLight }),
    );
    const dark = asNode(
      BandedRecord({ text: "x", isFocused: true, bandSlot: "even", display: truecolorDark }),
    );
    expect(light.props?.borderColor).not.toBe(dark.props?.borderColor);
  });

  test("context record at truecolor: no border, banding background applied", () => {
    const box = asNode(
      BandedRecord({ text: "x", isFocused: false, bandSlot: "odd", display: truecolorLight }),
    );
    expect(typeof box.props?.backgroundColor).toBe("string");
    expect(box.props?.backgroundColor).not.toBe("transparent");
    expect(box.props?.borderStyle).toBeUndefined();
  });

  test("16-color focused record: single border, ▶ marker prefixed inline, no banding bg", () => {
    const box = asNode(
      BandedRecord({ text: "Lunch", isFocused: true, bandSlot: "even", display: sixteenLight }),
    );
    expect(box.props?.borderStyle).toBe("single");
    expect(box.props?.backgroundColor).toBeUndefined();
    const inner = asNode(box.children?.[0]);
    expect(String(inner.props?.content ?? "")).toContain("▶");
    expect(String(inner.props?.content ?? "")).toContain("Lunch");
  });

  test("16-color focused record: borderColor is unset (mono fallback)", () => {
    const box = asNode(
      BandedRecord({ text: "x", isFocused: true, bandSlot: "even", display: sixteenLight }),
    );
    expect(box.props?.borderStyle).toBe("single");
    expect(box.props?.borderColor).toBeUndefined();
  });

  test("mono focused record: borderColor is unset (NO_COLOR honored)", () => {
    const box = asNode(
      BandedRecord({ text: "x", isFocused: true, bandSlot: "even", display: monoLight }),
    );
    expect(box.props?.borderStyle).toBe("single");
    expect(box.props?.borderColor).toBeUndefined();
  });

  test("16-color context record: │ marker prefixed inline, no border", () => {
    const box = asNode(
      BandedRecord({ text: "Uber", isFocused: false, bandSlot: "even", display: sixteenLight }),
    );
    expect(box.props?.borderStyle).toBeUndefined();
    const inner = asNode(box.children?.[0]);
    expect(String(inner.props?.content ?? "")).toContain("│");
    expect(String(inner.props?.content ?? "")).toContain("Uber");
  });
});
