import { describe, expect, test } from "bun:test";
import {
  type FilterBuilderState,
  openFilterBuilder,
  reduceFilterBuilder,
  stateToPredicate,
  valueOptionsFromPaletteData,
} from "../../src/overlay/filter-builder.ts";
import type { PaletteData } from "../../src/store/palette-data.ts";
import { serializePredicate } from "../../src/store/queues/predicate.ts";

function data(): PaletteData {
  return {
    counts: new Map(),
    sources: ["llm:gpt-4", "regex.simple"],
    labels: ["food", "travel"],
    reasons: ["low_confidence"],
    issueTypes: ["label_issue"],
    corrections: [],
    sourceCounts: new Map(),
    labelCounts: new Map(),
    topics: [],
    formats: [],
    queueNames: [],
    filterValues: {
      finalLabels: ["food", "travel"],
      prevLabels: ["food"],
      confidences: ["0.2", "0.9"],
    },
    totalRecords: 10,
  };
}

function key(name: string) {
  return { kind: "key" as const, event: { name } };
}

function ctrlKey(name: string) {
  return { kind: "key" as const, event: { name, ctrl: true } };
}

describe("filter builder overlay", () => {
  test("opens with real DB-backed value options", () => {
    const options = valueOptionsFromPaletteData(data());
    expect(options.source).toEqual(["llm:gpt-4", "regex.simple"]);
    expect(options.final_label).toEqual(["food", "travel"]);
    expect(options.confidence).toEqual([]);
    expect(options.issue_type).toEqual(["label_issue"]);
  });

  test("cycles chips and emits a preview effect for the next predicate", () => {
    const s0 = openFilterBuilder(data());
    const s1 = reduceFilterBuilder(s0, key("right")).overlay!.state as FilterBuilderState;
    expect(s1.activeCell).toBe("operator");

    const result = reduceFilterBuilder(s1, key("down"));
    const s2 = result.overlay!.state as FilterBuilderState;
    expect(s2.rows[0]!.operator).toBe("!=");
    expect(result.effects).toEqual([
      {
        kind: "scheduleFilterPreview",
        predicate: stateToPredicate(s2)!,
        revision: s2.revision,
      },
    ]);
  });

  test("supports multiple rows joined by or", () => {
    let state = openFilterBuilder(data());
    state = reduceFilterBuilder(state, key("o")).overlay!.state as FilterBuilderState;
    expect(state.rows).toHaveLength(2);
    expect(state.rows[1]!.join).toBe("or");
    const predicate = stateToPredicate(state);
    expect(predicate?.kind).toBe("or");
  });

  test("join keys update the visible connector to the next row", () => {
    let state = openFilterBuilder(data());
    state = reduceFilterBuilder(state, key("+")).overlay!.state as FilterBuilderState;
    state = { ...state, activeRow: 0 };
    state = reduceFilterBuilder(state, key("o")).overlay!.state as FilterBuilderState;
    expect(state.rows).toHaveLength(2);
    expect(state.rows[1]!.join).toBe("or");
  });

  test("in operator value chip toggles multiple selected values", () => {
    let state = openFilterBuilder(data());
    state = reduceFilterBuilder(state, key("right")).overlay!.state as FilterBuilderState;
    state = reduceFilterBuilder(state, key("down")).overlay!.state as FilterBuilderState;
    state = reduceFilterBuilder(state, key("down")).overlay!.state as FilterBuilderState;
    expect(state.rows[0]!.operator).toBe("in");

    state = reduceFilterBuilder(state, key("right")).overlay!.state as FilterBuilderState;
    state = reduceFilterBuilder(state, key("down")).overlay!.state as FilterBuilderState;
    state = reduceFilterBuilder(state, key("space")).overlay!.state as FilterBuilderState;

    expect(state.rows[0]!.values).toEqual(["llm:gpt-4", "regex.simple"]);
    const predicate = stateToPredicate(state);
    expect(predicate).toEqual({
      kind: "in",
      column: "source",
      values: ["llm:gpt-4", "regex.simple"],
    });
  });

  test("value editing accepts a, o, and + as literal characters", () => {
    let state = openFilterBuilder(data());
    state = reduceFilterBuilder(state, key("right")).overlay!.state as FilterBuilderState;
    state = reduceFilterBuilder(state, key("right")).overlay!.state as FilterBuilderState;
    state = { ...state, rows: [{ ...state.rows[0]!, value: "" }] };

    for (const ch of "manual+food") {
      state = reduceFilterBuilder(state, key(ch)).overlay!.state as FilterBuilderState;
    }

    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]!.value).toBe("manual+food");
  });

  test("in operator preserves comma-bearing values as structured selections", () => {
    let state = openFilterBuilder({
      ...data(),
      sources: ["vendor,one", "vendor,two"],
    });
    state = reduceFilterBuilder(state, key("right")).overlay!.state as FilterBuilderState;
    state = reduceFilterBuilder(state, key("down")).overlay!.state as FilterBuilderState;
    state = reduceFilterBuilder(state, key("down")).overlay!.state as FilterBuilderState;
    state = reduceFilterBuilder(state, key("right")).overlay!.state as FilterBuilderState;

    expect(state.rows[0]!.values).toEqual(["vendor,one"]);
    expect(stateToPredicate(state)).toEqual({
      kind: "in",
      column: "source",
      values: ["vendor,one"],
    });
  });

  test("ctrl+j and ctrl+k move between filter rows", () => {
    let state = openFilterBuilder(data());
    state = reduceFilterBuilder(state, key("+")).overlay!.state as FilterBuilderState;
    expect(state.activeRow).toBe(1);
    state = reduceFilterBuilder(state, ctrlKey("k")).overlay!.state as FilterBuilderState;
    expect(state.activeRow).toBe(0);
    state = reduceFilterBuilder(state, ctrlKey("j")).overlay!.state as FilterBuilderState;
    expect(state.activeRow).toBe(1);
  });

  test("invalid commit keeps builder open with inline error", () => {
    let state = openFilterBuilder(data());
    state = {
      ...state,
      activeCell: "value",
      rows: [{ ...state.rows[0]!, column: "confidence", operator: "=", value: "abc", values: [] }],
    };
    const result = reduceFilterBuilder(state, { kind: "commit" });
    expect(result.overlay?.kind).toBe("filter-builder");
    if (result.overlay?.kind === "filter-builder") {
      expect(result.overlay.state.preview).toEqual({
        kind: "error",
        message: "choose or type a valid value before applying",
      });
    }
    expect(result.effects).toEqual([]);
  });

  test("commit dispatches the existing palette.where command with serialized predicate", () => {
    const state = openFilterBuilder(data());
    const predicate = stateToPredicate(state)!;
    const expr = serializePredicate(predicate);
    const result = reduceFilterBuilder(state, { kind: "commit" });
    expect(result.overlay).toBeNull();
    expect(result.effects).toEqual([
      { kind: "close" },
      { kind: "pushPaletteHistory", entry: `where ${expr}` },
      { kind: "runCommand", commandName: "palette.where", argument: expr },
    ]);
  });
});
