import { describe, expect, test } from "bun:test";
import { openPicker, reducePicker } from "../../src/overlay/picker.ts";
import type { PickerState } from "../../src/overlay/types.ts";

const LABELS = ["food", "travel", "utility", "other", "transport", "fashion"];
const RECORD = "rec-1";

function init(predicted: string | null = "food"): PickerState {
  return openPicker({
    recordId: RECORD,
    allLabels: LABELS,
    predicted,
    predictedConfidence: predicted ? 0.83 : null,
  });
}

describe("openPicker", () => {
  test("initial state highlights predicted label and shows all candidates", () => {
    const s = init();
    expect(s.recordId).toBe(RECORD);
    expect(s.filter).toBe("");
    expect(s.candidates.length).toBe(LABELS.length);
    expect(s.candidates[s.highlight]?.label).toBe("food");
    expect(s.candidates[s.highlight]?.predicted).toBe(true);
  });

  test("highlight=0 when predicted not in label set", () => {
    const s = init("missing");
    expect(s.highlight).toBe(0);
  });
});

describe("reducePicker", () => {
  test("printable key appends to filter and re-ranks candidates", () => {
    const r = reducePicker(init(), { kind: "key", event: { name: "t" } });
    expect(r.effects).toEqual([]);
    const next = r.overlay!.state as PickerState;
    expect(next.filter).toBe("t");
    expect(next.candidates.map((c) => c.label)).toEqual([
      "travel",
      "transport",
      "utility",
      "other",
    ]);
    expect(next.highlight).toBe(0);
  });

  test("backspace pops one char", () => {
    let s: PickerState = init();
    let r = reducePicker(s, { kind: "key", event: { name: "t" } });
    s = r.overlay!.state as PickerState;
    r = reducePicker(s, { kind: "key", event: { name: "r" } });
    s = r.overlay!.state as PickerState;
    r = reducePicker(s, { kind: "key", event: { name: "backspace" } });
    expect((r.overlay!.state as PickerState).filter).toBe("t");
  });

  test("space (named 'space') appends to filter", () => {
    const r = reducePicker(init(), { kind: "key", event: { name: "space" } });
    expect((r.overlay!.state as PickerState).filter).toBe(" ");
  });

  test("down arrow clamps at end", () => {
    let s = init();
    for (let i = 0; i < 100; i++) {
      const r = reducePicker(s, { kind: "key", event: { name: "down" } });
      s = r.overlay!.state as PickerState;
    }
    expect(s.highlight).toBe(s.candidates.length - 1);
  });

  test("up arrow clamps at 0", () => {
    let s = init();
    for (let i = 0; i < 100; i++) {
      const r = reducePicker(s, { kind: "key", event: { name: "up" } });
      s = r.overlay!.state as PickerState;
    }
    expect(s.highlight).toBe(0);
  });

  test("digit key remaps highlight onto filtered set", () => {
    let s = init();
    s = reducePicker(s, { kind: "key", event: { name: "t" } }).overlay!.state as PickerState;
    const r = reducePicker(s, { kind: "key", event: { name: "3" } });
    expect((r.overlay!.state as PickerState).highlight).toBe(2);
  });

  test("digit out of range is no-op", () => {
    const r = reducePicker(init(), { kind: "key", event: { name: "9" } });
    expect((r.overlay!.state as PickerState).highlight).toBe(0);
  });

  test("Escape emits close and discards state", () => {
    const r = reducePicker(init(), { kind: "key", event: { name: "escape" } });
    expect(r.overlay).toBeNull();
    expect(r.effects).toEqual([{ kind: "close" }]);
  });

  test("commit event emits commitDecision + close", () => {
    let s = init();
    s = reducePicker(s, { kind: "key", event: { name: "t" } }).overlay!.state as PickerState;
    const r = reducePicker(s, { kind: "commit" });
    expect(r.overlay).toBeNull();
    expect(r.effects).toEqual([
      {
        kind: "commitDecision",
        recordId: RECORD,
        status: "relabeled",
        finalLabel: "travel",
        prevLabel: "food",
        sourceOfTruth: "human",
      },
      { kind: "close" },
    ]);
  });

  test("commit on predicted label emits status='accepted' with prev=null", () => {
    const r = reducePicker(init(), { kind: "commit" });
    expect(r.effects).toEqual([
      {
        kind: "commitDecision",
        recordId: RECORD,
        status: "accepted",
        finalLabel: "food",
        prevLabel: null,
        sourceOfTruth: "human",
      },
      { kind: "close" },
    ]);
  });

  test("Enter (key 'return') commits identically to commit event", () => {
    const r = reducePicker(init(), { kind: "key", event: { name: "return" } });
    expect(r.overlay).toBeNull();
    expect(r.effects.some((e) => e.kind === "commitDecision")).toBe(true);
  });

  test("commit with empty candidates is a no-op (preserves filter)", () => {
    let s = init();
    s = reducePicker(s, { kind: "key", event: { name: "z" } }).overlay!.state as PickerState;
    expect(s.candidates.length).toBe(0);
    const r = reducePicker(s, { kind: "commit" });
    expect(r.effects).toEqual([]);
    expect(r.overlay?.kind).toBe("picker");
    expect((r.overlay!.state as PickerState).filter).toBe("z");
  });

  test("Enter with empty candidates is a no-op (preserves filter)", () => {
    let s = init();
    s = reducePicker(s, { kind: "key", event: { name: "z" } }).overlay!.state as PickerState;
    const r = reducePicker(s, { kind: "key", event: { name: "return" } });
    expect(r.effects).toEqual([]);
    expect((r.overlay!.state as PickerState).filter).toBe("z");
  });
});
