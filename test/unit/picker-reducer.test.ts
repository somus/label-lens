import { describe, expect, test } from "bun:test";
import { initialPicker, type PickerEvent, pickerReduce } from "../../src/picker/reducer.ts";

const LABELS = ["food", "travel", "utility", "other", "transport", "fashion"];

function init() {
  return initialPicker(LABELS, "food"); // predicted = food
}

function send(state: ReturnType<typeof init>, ...events: PickerEvent[]) {
  let s = state;
  for (const e of events) s = pickerReduce(s, e);
  return s;
}

describe("pickerReduce", () => {
  test("initial state highlights predicted label", () => {
    const s = init();
    expect(s.filter).toBe("");
    expect(s.candidates[s.highlight]?.label).toBe("food");
  });

  test("printable char appends to filter and re-filters candidates", () => {
    const s = send(init(), { kind: "char", char: "t" });
    expect(s.filter).toBe("t");
    expect(s.candidates.map((c) => c.label)).toEqual(["travel", "transport", "utility", "other"]);
    expect(s.highlight).toBe(0);
  });

  test("backspace pops one char", () => {
    const s = send(
      init(),
      { kind: "char", char: "t" },
      { kind: "char", char: "r" },
      {
        kind: "backspace",
      },
    );
    expect(s.filter).toBe("t");
  });

  test("down arrow moves highlight forward; clamped at end", () => {
    const s = send(init(), { kind: "down" }, { kind: "down" }, { kind: "down" });
    const after = send(s, { kind: "down" }, { kind: "down" }, { kind: "down" }, { kind: "down" });
    expect(after.highlight).toBe(after.candidates.length - 1);
  });

  test("up arrow moves backward; clamped at 0", () => {
    let s = init();
    s = send(s, { kind: "up" }, { kind: "up" }, { kind: "up" }, { kind: "up" });
    expect(s.highlight).toBe(0);
  });

  test("filter that yields no matches keeps highlight=0", () => {
    const s = send(init(), { kind: "char", char: "z" });
    expect(s.candidates).toEqual([]);
    expect(s.highlight).toBe(0);
  });
});
