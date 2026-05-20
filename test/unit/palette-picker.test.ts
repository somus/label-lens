import { describe, expect, test } from "bun:test";
import { openPicker, reducePicker } from "../../src/overlay/palette-picker.ts";

function key(name: string) {
  return { kind: "key" as const, event: { name } };
}

describe("openPicker", () => {
  test("initializes with all candidates and empty filter", () => {
    const picker = openPicker("palette.by-source", "source", ["llm", "human", "rules"]);
    expect(picker.commandName).toBe("palette.by-source");
    expect(picker.candidates).toEqual(["llm", "human", "rules"]);
    expect(picker.filter).toBe("");
    expect(picker.highlight).toBe(0);
    expect(picker.step).toBeUndefined();
  });

  test("correction picker starts at step 'from'", () => {
    const picker = openPicker("palette.by-correction", "correction", ["food", "travel"]);
    expect(picker.step).toBe("from");
    expect(picker.title).toContain("from?");
  });
});

describe("reducePicker navigation", () => {
  test("down moves highlight, clamped at last", () => {
    let picker = openPicker("p", "source", ["a", "b", "c"]);
    let result = reducePicker(picker, key("down"));
    expect(result.kind).toBe("updated");
    picker = (result as { kind: "updated"; picker: typeof picker }).picker;
    expect(picker.highlight).toBe(1);

    result = reducePicker(picker, key("down"));
    picker = (result as { kind: "updated"; picker: typeof picker }).picker;
    result = reducePicker(picker, key("down"));
    picker = (result as { kind: "updated"; picker: typeof picker }).picker;
    expect(picker.highlight).toBe(2);
  });

  test("up at 0 stays at 0", () => {
    const picker = openPicker("p", "source", ["a", "b"]);
    const result = reducePicker(picker, key("up"));
    expect(result.kind).toBe("updated");
    expect((result as { kind: "updated"; picker: typeof picker }).picker.highlight).toBe(0);
  });
});

describe("reducePicker filter", () => {
  test("typing narrows candidates", () => {
    let picker = openPicker("p", "source", ["llm:gpt-4", "llm:claude", "human"]);
    const result = reducePicker(picker, key("h"));
    picker = (result as { kind: "updated"; picker: typeof picker }).picker;
    expect(picker.candidates).toEqual(["human"]);
    expect(picker.filter).toBe("h");
  });

  test("backspace widens candidates", () => {
    let picker = openPicker("p", "source", ["llm:gpt-4", "human"]);
    let result = reducePicker(picker, key("h"));
    picker = (result as { kind: "updated"; picker: typeof picker }).picker;
    result = reducePicker(picker, key("backspace"));
    picker = (result as { kind: "updated"; picker: typeof picker }).picker;
    expect(picker.candidates).toEqual(["llm:gpt-4", "human"]);
    expect(picker.filter).toBe("");
  });
});

describe("reducePicker selection", () => {
  test("enter on highlighted candidate emits selected", () => {
    const picker = openPicker("palette.by-source", "source", ["llm", "human"]);
    const result = reducePicker(picker, key("return"));
    expect(result.kind).toBe("selected");
    const sel = result as { kind: "selected"; commandName: string; argument: string };
    expect(sel.commandName).toBe("palette.by-source");
    expect(sel.argument).toBe("llm");
  });

  test("escape returns back", () => {
    const picker = openPicker("p", "source", ["a"]);
    const result = reducePicker(picker, key("escape"));
    expect(result.kind).toBe("back");
  });

  test("enter on empty candidates is noop", () => {
    let picker = openPicker("p", "source", ["llm"]);
    let result = reducePicker(picker, key("x"));
    picker = (result as { kind: "updated"; picker: typeof picker }).picker;
    expect(picker.candidates.length).toBe(0);
    result = reducePicker(picker, key("return"));
    expect(result.kind).toBe("noop");
  });

  test("cancel returns to palette browse mode without selecting", () => {
    const picker = openPicker("p", "source", ["llm"]);
    expect(reducePicker(picker, { kind: "cancel" }).kind).toBe("back");
  });

  test("non-key events are noops", () => {
    const picker = openPicker("p", "source", ["llm"]);
    expect(reducePicker(picker, { kind: "streamToken", token: "x" }).kind).toBe("noop");
  });
});

describe("reducePicker correction two-step", () => {
  test("enter on from-step advances to to-step", () => {
    let picker = openPicker("palette.by-correction", "correction", ["food", "travel"]);
    expect(picker.step).toBe("from");
    const result = reducePicker(picker, key("return"));
    expect(result.kind).toBe("updated");
    picker = (result as { kind: "updated"; picker: typeof picker }).picker;
    expect(picker.step).toBe("to");
    expect(picker.selectedFrom).toBe("food");
    expect(picker.title).toContain("food");
    expect(picker.title).toContain("→");
  });

  test("tab on from-step also advances", () => {
    const picker = openPicker("palette.by-correction", "correction", ["food"]);
    const result = reducePicker(picker, key("tab"));
    expect(result.kind).toBe("updated");
    const updated = (result as { kind: "updated"; picker: typeof picker }).picker;
    expect(updated.step).toBe("to");
  });
});
