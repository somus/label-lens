import { describe, expect, test } from "bun:test";
import { type GuidelinesState, reduceGuidelines } from "../../src/overlay/guidelines.ts";
import { openHelp, reduceHelp } from "../../src/overlay/help.ts";
import { openNote, reduceNote } from "../../src/overlay/note.ts";
import { openPalette, reducePalette } from "../../src/overlay/palette.ts";
import { openPicker, reducePicker } from "../../src/overlay/picker.ts";
import { type QueueState, reduceQueue } from "../../src/overlay/queue.ts";

function key(name: string, overrides: { ctrl?: boolean; shift?: boolean; meta?: boolean } = {}) {
  return { kind: "key" as const, event: { name, ...overrides } };
}

describe("overlay key propagation", () => {
  test("read-only overlays propagate unclaimed keys", () => {
    const help = openHelp({ scope: "review", commands: [] });
    expect(reduceHelp(help, key(":")).propagated).toBe(true);

    const guidelines: GuidelinesState = {
      source: "config",
      content: "Review guide",
      scroll: 0,
      title: "guidelines",
    };
    expect(reduceGuidelines(guidelines, key("?")).propagated).toBe(true);
  });

  test("picker-style overlays propagate keys they do not claim", () => {
    const picker = openPicker({
      recordId: "rec-1",
      allLabels: [{ name: "food" }, { name: "travel" }],
      predicted: "food",
      predictedConfidence: 0.9,
    });
    expect(reducePicker(picker, key(":")).propagated).toBe(true);

    const queue: QueueState = {
      totalRecords: 2,
      highlight: 0,
      sections: [
        {
          title: "Review Queues",
          icon: "*",
          rows: [
            { id: "pending", label: "Pending", description: "Pending", count: 2, preview: null },
          ],
        },
      ],
    };
    expect(reduceQueue(queue, key(":")).propagated).toBe(true);
  });

  test("text-input overlays continue to capture unclaimed printable keys", () => {
    const note = openNote({ recordId: "rec-1", initial: "" });
    const noteResult = reduceNote(note, key(":"));
    expect(noteResult.propagated).toBeUndefined();
    if (noteResult.overlay?.kind === "note") expect(noteResult.overlay.state.value).toBe(":");

    const palette = openPalette({
      scope: "review",
      history: [],
      commands: [{ name: "palette.queue", scope: "global", palette: ":queue", run: () => {} }],
    });
    const paletteResult = reducePalette(palette, key("x"));
    expect(paletteResult.propagated).toBeUndefined();
    if (paletteResult.overlay?.kind === "palette") {
      expect(paletteResult.overlay.state.filter).toBe("x");
    }
  });
});
