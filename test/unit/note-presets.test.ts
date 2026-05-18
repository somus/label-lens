import { describe, expect, test } from "bun:test";
import { openNote, reduceNote } from "../../src/overlay/note.ts";

function keyEvent(name: string, opts: { meta?: boolean; shift?: boolean } = {}) {
  return { kind: "key" as const, event: { name, meta: opts.meta, shift: opts.shift } };
}

describe("note overlay presets", () => {
  test("openNote caps presets at 9 + trims blank entries", () => {
    const state = openNote({
      recordId: "r1",
      initial: "",
      presets: ["a", "  ", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
    });
    expect(state.presets).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
  });

  test("alt+digit appends the matching preset onto the value", () => {
    const state = openNote({
      recordId: "r1",
      initial: "",
      presets: ["needs-help", "ambiguous"],
    });
    const result = reduceNote(state, keyEvent("1", { meta: true }));
    expect(result.overlay?.kind).toBe("note");
    expect(
      result.overlay && result.overlay.kind === "note" ? result.overlay.state.value : undefined,
    ).toBe("needs-help");
  });

  test("alt+digit appends a space separator when value already has content", () => {
    const state = openNote({
      recordId: "r1",
      initial: "review note",
      presets: ["needs-help"],
    });
    const result = reduceNote(state, keyEvent("1", { meta: true }));
    expect(
      result.overlay && result.overlay.kind === "note" ? result.overlay.state.value : undefined,
    ).toBe("review note needs-help");
  });

  test("plain digit (no meta) still types the digit into the note", () => {
    const state = openNote({
      recordId: "r1",
      initial: "",
      presets: ["needs-help"],
    });
    const result = reduceNote(state, keyEvent("1"));
    expect(
      result.overlay && result.overlay.kind === "note" ? result.overlay.state.value : undefined,
    ).toBe("1");
  });

  test("alt+digit beyond preset count is a no-op", () => {
    const state = openNote({ recordId: "r1", initial: "x", presets: ["only-one"] });
    const result = reduceNote(state, keyEvent("5", { meta: true }));
    expect(
      result.overlay && result.overlay.kind === "note" ? result.overlay.state.value : undefined,
    ).toBe("x");
  });
});
