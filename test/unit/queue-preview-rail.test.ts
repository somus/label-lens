import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { QueuePreview, type QueuePreviewRow } from "../../src/render/chrome/queue-preview.ts";
import { displayFor } from "../util/display.ts";

async function render(rows: QueuePreviewRow[], focusedIndex: number, width = 28): Promise<string> {
  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
    width,
    height: 8,
  });
  renderer.root.add(
    QueuePreview({
      display: displayFor({ color: "truecolor" }),
      width,
      rows,
      focusedIndex,
    }),
  );
  await renderOnce();
  return captureCharFrame();
}

describe("QueuePreview rail", () => {
  test("renders the wide-terminal rail header and focused marker", async () => {
    const frame = await render(
      [
        { id: "abcdef1234567890", label: "food", confidence: 0.92 },
        { id: "123456abcdef7890", label: "travel", confidence: 0.44 },
      ],
      1,
    );
    expect(frame).toContain("Next up");
    expect(frame).toContain("rabcde food");
    expect(frame).toContain("▸ r12345 travel");
    expect(frame).toContain("44%");
  });

  test("renders an explicit empty-queue row", async () => {
    const frame = await render([], 0);
    expect(frame).toContain("(queue is empty)");
  });

  test("renders null label and null confidence without placeholder drift", async () => {
    const frame = await render([{ id: "abcdef1234567890", label: null, confidence: null }], 0);
    expect(frame).toContain("▸ rabcde —");
    expect(frame).not.toContain("NaN");
    expect(frame).not.toContain("null");
  });

  test("truncates long labels inside the fixed rail width", async () => {
    const frame = await render(
      [
        {
          id: "abcdef1234567890",
          label: "very-long-predicted-label-name",
          confidence: 0.99,
        },
      ],
      0,
      24,
    );
    expect(frame).toContain("very-lon");
    expect(frame).toContain("…");
    expect(frame).toContain("99%");
  });
});
