import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import type { Box } from "../../src/render/box.ts";
import { Scrollbar } from "../../src/render/scrollbar.ts";
import { displayFor } from "../util/display.ts";

async function frame(box: ReturnType<typeof Box>, width = 4, height = 12): Promise<string[]> {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width, height });
  renderer.root.add(box);
  await renderOnce();
  return captureCharFrame().split("\n");
}

describe("Scrollbar", () => {
  test("no overflow: spacer column has `visible` rows (caps off)", async () => {
    const lines = await frame(
      Scrollbar({ display: displayFor({ color: "mono" }), total: 5, visible: 8, scrollTop: 0 }),
      4,
      8,
    );
    expect(lines.every((l) => l.trim() === "")).toBe(true);
  });

  test("no overflow + caps: column height equals `visible` (cap blanks at ends)", async () => {
    const lines = await frame(
      Scrollbar({
        display: displayFor({ color: "mono" }),
        total: 5,
        visible: 8,
        scrollTop: 0,
        caps: true,
      }),
      4,
      8,
    );
    expect(lines.every((l) => l.trim() === "")).toBe(true);
    expect(lines.length).toBeGreaterThanOrEqual(8);
  });

  test("overflow + rich: thumb chars rendered", async () => {
    const lines = await frame(
      Scrollbar({
        display: displayFor({ color: "truecolor" }),
        total: 30,
        visible: 10,
        scrollTop: 0,
      }),
      4,
      10,
    );
    const joined = lines.join("");
    expect(joined).toContain("▊");
    expect(joined).toContain("│");
  });

  test("overflow + mono: thumb uses `#`, track uses `|`", async () => {
    const lines = await frame(
      Scrollbar({
        display: displayFor({ color: "mono" }),
        total: 30,
        visible: 10,
        scrollTop: 0,
      }),
      4,
      10,
    );
    const joined = lines.join("");
    expect(joined).toContain("#");
    expect(joined).toContain("|");
  });

  test("caps + rich: arrow glyphs at extremes", async () => {
    const lines = await frame(
      Scrollbar({
        display: displayFor({ color: "truecolor" }),
        total: 30,
        visible: 10,
        scrollTop: 0,
        caps: true,
      }),
      4,
      10,
    );
    const joined = lines.join("");
    expect(joined).toContain("▲");
    expect(joined).toContain("▼");
  });

  test("caps + mono: glyph at active end, ASCII fallback at dim end", async () => {
    const top = await frame(
      Scrollbar({
        display: displayFor({ color: "mono" }),
        total: 30,
        visible: 10,
        scrollTop: 0,
        caps: true,
      }),
      4,
      10,
    );
    const topJoined = top.join("");
    // at top: up disabled → ASCII fallback `^`; down active → glyph `▼`
    expect(topJoined).toContain("^");
    expect(topJoined).toContain("▼");

    const bottom = await frame(
      Scrollbar({
        display: displayFor({ color: "mono" }),
        total: 30,
        visible: 10,
        scrollTop: 20,
        caps: true,
      }),
      4,
      10,
    );
    const bottomJoined = bottom.join("");
    // at bottom: down disabled → `v`; up active → `▲`
    expect(bottomJoined).toContain("▲");
    expect(bottomJoined).toContain("v");
  });
});
