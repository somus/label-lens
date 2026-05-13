import { describe, expect, test } from "bun:test";
import { borderForRole, resolveTheme } from "../../src/render/theme.ts";
import { displayFor } from "../util/display.ts";

describe("resolveTheme", () => {
  test("returns full token set at every capability", () => {
    for (const color of ["truecolor", "256", "16", "mono"] as const) {
      const tokens = resolveTheme(displayFor({ color }));
      expect(tokens.fg.default).toBeDefined();
      expect(tokens.fg.success).toBeDefined();
      expect(tokens.fg.warning).toBeDefined();
      expect(tokens.fg.danger).toBeDefined();
      expect(tokens.fg.info).toBeDefined();
      expect(tokens.bg.band.even).toBeDefined();
      expect(tokens.bg.soft.warning).toBeDefined();
      expect(tokens.border.focus).toBeDefined();
    }
  });

  test("light and dark palettes differ at truecolor", () => {
    const light = resolveTheme(displayFor({ color: "truecolor", theme: "light" }));
    const dark = resolveTheme(displayFor({ color: "truecolor", theme: "dark" }));
    expect(light.fg.default).not.toBe(dark.fg.default);
    expect(light.bg.band.even).not.toBe(dark.bg.band.even);
  });

  test("16-color and mono use ANSI names / transparent backgrounds", () => {
    const sixteen = resolveTheme(displayFor({ color: "16" }));
    expect(sixteen.fg.accent).toBe("cyan");
    expect(sixteen.bg.band.even).toBe("transparent");
    expect(sixteen.bg.soft.warning).toBe("transparent");

    const mono = resolveTheme(displayFor({ color: "mono" }));
    expect(mono.fg.danger).toBe("white");
    expect(mono.bg.band.even).toBe("transparent");
  });
});

describe("borderForRole", () => {
  test("rounded on truecolor / 256, single on mono / 16", () => {
    expect(borderForRole(displayFor({ color: "truecolor" }), "overlay")).toBe("rounded");
    expect(borderForRole(displayFor({ color: "256" }), "focus")).toBe("rounded");
    expect(borderForRole(displayFor({ color: "16" }), "overlay")).toBe("single");
    expect(borderForRole(displayFor({ color: "mono" }), "focus")).toBe("single");
  });

  test("subtle role always renders single (Card-style dividers)", () => {
    expect(borderForRole(displayFor({ color: "truecolor" }), "subtle")).toBe("single");
  });
});
