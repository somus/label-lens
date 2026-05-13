import { describe, expect, test } from "bun:test";
import { Badge } from "../../src/render/badge.ts";
import { displayFor } from "../util/display.ts";

describe("Badge", () => {
  test("default glyphs map to variant", () => {
    const trueLight = displayFor({ color: "truecolor" });
    const info = Badge({ display: trueLight, variant: "info", label: "hint" });
    const success = Badge({ display: trueLight, variant: "success", label: "ok" });
    const warning = Badge({ display: trueLight, variant: "warning", label: "low" });
    const danger = Badge({ display: trueLight, variant: "danger", label: "err" });
    expect(info.chunks[0]?.text).toContain("ℹ");
    expect(success.chunks[0]?.text).toContain("✓");
    expect(warning.chunks[0]?.text).toContain("⚠");
    expect(danger.chunks[0]?.text).toContain("✗");
  });

  test("custom icon overrides default glyph", () => {
    const styled = Badge({
      display: displayFor({ color: "truecolor" }),
      variant: "info",
      label: "x",
      icon: "★",
    });
    expect(styled.chunks[0]?.text).toContain("★");
  });

  test("empty icon hides the glyph", () => {
    const styled = Badge({
      display: displayFor({ color: "truecolor" }),
      variant: "info",
      label: "x",
      icon: "",
    });
    expect(styled.chunks[0]?.text).not.toContain("ℹ");
    expect(styled.chunks[0]?.text).toContain("x");
  });

  test("renders text-only chunks on mono (no fg color)", () => {
    const styled = Badge({
      display: displayFor({ color: "mono" }),
      variant: "warning",
      label: "low conf",
    });
    // Mono path uses bold only; no fg attribute color encoded.
    expect(styled.chunks[0]?.fg).toBeUndefined();
    expect(styled.chunks[0]?.text).toContain("⚠");
  });

  test("preserves variant fg color at 16-color", () => {
    const warn = Badge({
      display: displayFor({ color: "16" }),
      variant: "warning",
      label: "low",
    });
    const danger = Badge({
      display: displayFor({ color: "16" }),
      variant: "danger",
      label: "err",
    });
    // Semantic color channel survives — each variant carries its own fg.
    expect(warn.chunks[0]?.fg).toBeDefined();
    expect(danger.chunks[0]?.fg).toBeDefined();
    expect(warn.chunks[0]?.fg).not.toEqual(danger.chunks[0]?.fg);
  });
});
