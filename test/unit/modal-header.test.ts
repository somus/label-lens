import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { ModalHeader } from "../../src/render/modal-frame.ts";
import { displayFor } from "../util/display.ts";

async function render(
  display: Parameters<typeof ModalHeader>[0]["display"],
  innerWidth: number,
  title = "Hello",
  termWidth = innerWidth + 2,
): Promise<string[]> {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
    width: termWidth,
    height: 4,
  });
  renderer.root.add(ModalHeader({ display, title, innerWidth }));
  await renderOnce();
  return captureCharFrame().split("\n");
}

describe("ModalHeader", () => {
  test("rich: dashes use `═`, title appears, trailing blank row included", async () => {
    const lines = await render(displayFor({ color: "truecolor" }), 30, "Commands");
    expect(lines[0]).toContain("══");
    expect(lines[0]).toContain("Commands");
    // trailing blank row folded into header
    expect(lines[1]?.trim() ?? "").toBe("");
  });

  test("mono: ASCII `==` fallback, title still present", async () => {
    const lines = await render(displayFor({ color: "mono" }), 30, "Commands");
    expect(lines[0]).toContain("==");
    expect(lines[0]).toContain("Commands");
    expect(lines[1]?.trim() ?? "").toBe("");
  });

  test("small innerWidth: tail never collapses (Math.max(1) floor)", async () => {
    // title=9 + 2 lead dashes + 2 spaces + 1 lead-space = 14; innerWidth=10 →
    // tail = max(1, 10-14) = 1. Renderer needs >= used+1 cols to show it.
    const lines = await render(displayFor({ color: "truecolor" }), 10, "LongTitle", 20);
    expect(lines[0]).toContain("LongTitle");
    expect(lines[0]).toMatch(/LongTitle\s+═/);
  });

  test("lead dash count is fixed at 2 (left-anchored heading)", async () => {
    const lines = await render(displayFor({ color: "truecolor" }), 40, "T");
    const m = lines[0]?.match(/^\s*(═+)\s+T/);
    expect(m?.[1]?.length).toBe(2);
  });
});
