import { describe, expect, test } from "bun:test";
import { overlayFooterHint } from "../../src/overlay/hints.ts";
import type { Overlay } from "../../src/overlay/types.ts";

// Cast — the hint renderer only branches on `overlay.kind`, never reads state.
const queueOverlay = { kind: "queue", state: {} } as unknown as Overlay;

function flatten(segs: ReturnType<typeof overlayFooterHint>): string {
  return segs.map((s) => s.text).join("");
}

describe("overlayFooterHint", () => {
  test("queue overlay shows j/k under vim preset", () => {
    expect(flatten(overlayFooterHint(queueOverlay, "vim"))).toContain("[j/k]");
  });

  test("queue overlay shows arrows under simple preset", () => {
    const out = flatten(overlayFooterHint(queueOverlay, "simple"));
    expect(out).toContain("[↑↓]");
    expect(out).not.toContain("j/k");
  });

  test("filter-builder shows ^j/^k under vim, ^↑↓ under simple", () => {
    const overlay: Overlay = {
      kind: "filter-builder",
      // Cast — the test only renders hints, not state.
      state: {} as never,
    };
    expect(flatten(overlayFooterHint(overlay, "vim"))).toContain("[^j/^k]");
    expect(flatten(overlayFooterHint(overlay, "simple"))).toContain("[^↑↓]");
  });
});
