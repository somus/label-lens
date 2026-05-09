import { describe, expect, test } from "bun:test";
import { openNote, reduceNote } from "../../src/overlay/note.ts";
import type { NoteState } from "../../src/overlay/types.ts";

const RECORD = "rec-1";

function init(value = ""): NoteState {
  return openNote({ recordId: RECORD, initial: value });
}

describe("openNote", () => {
  test("initial state holds recordId + initial value", () => {
    const s = init("prior");
    expect(s.recordId).toBe(RECORD);
    expect(s.value).toBe("prior");
  });
});

describe("reduceNote", () => {
  test("printable char appends to value", () => {
    const r = reduceNote(init(), { kind: "key", event: { name: "h" } });
    expect((r.overlay!.state as NoteState).value).toBe("h");
    expect(r.effects).toEqual([]);
  });

  test("space (named 'space') appends a space", () => {
    const r = reduceNote(init("hi"), { kind: "key", event: { name: "space" } });
    expect((r.overlay!.state as NoteState).value).toBe("hi ");
  });

  test("backspace pops one char", () => {
    const s: NoteState = init("hello");
    const r = reduceNote(s, { kind: "key", event: { name: "backspace" } });
    expect((r.overlay!.state as NoteState).value).toBe("hell");
  });

  test("escape closes without commit", () => {
    const r = reduceNote(init("draft"), { kind: "key", event: { name: "escape" } });
    expect(r.overlay).toBeNull();
    expect(r.effects).toEqual([{ kind: "close" }]);
  });

  test("Enter emits updateNote + close", () => {
    const r = reduceNote(init("done"), { kind: "key", event: { name: "return" } });
    expect(r.overlay).toBeNull();
    expect(r.effects).toEqual([
      { kind: "updateNote", recordId: RECORD, value: "done" },
      { kind: "close" },
    ]);
  });

  test("commit event mirrors Enter", () => {
    const r = reduceNote(init("done"), { kind: "commit" });
    expect(r.effects).toEqual([
      { kind: "updateNote", recordId: RECORD, value: "done" },
      { kind: "close" },
    ]);
  });

  test("non-printable keys are ignored", () => {
    const r = reduceNote(init("x"), { kind: "key", event: { name: "f5" } });
    expect((r.overlay!.state as NoteState).value).toBe("x");
  });
});
