import type { PaletteData } from "../store/palette-data.ts";
import {
  BUILDER_COLUMNS,
  operatorsForColumn,
  type Predicate,
  type PredicateColumn,
  type PredicateOperator,
  type PredicateValue,
  serializePredicate,
} from "../store/queues/predicate.ts";
import { isOverlayRowNext, isOverlayRowPrev } from "./key-match.ts";
import type { Overlay, OverlayEvent, ReduceResult } from "./types.ts";

export type FilterBuilderCell = "column" | "operator" | "value";
export type FilterBuilderJoin = "and" | "or";
export type FilterBuilderColumn = (typeof BUILDER_COLUMNS)[number];
export type FilterBuilderRow = {
  column: FilterBuilderColumn;
  operator: PredicateOperator;
  value: string;
  values: string[];
  valueCursor: number;
  join: FilterBuilderJoin;
};

export type FilterBuilderPreview =
  | { kind: "pending" }
  | { kind: "ready"; count: number }
  | { kind: "error"; message: string };

export type FilterBuilderValueOptions = Record<FilterBuilderColumn, string[]>;

export type FilterBuilderState = {
  rows: FilterBuilderRow[];
  activeRow: number;
  activeCell: FilterBuilderCell;
  revision: number;
  preview: FilterBuilderPreview;
  valueOptions: FilterBuilderValueOptions;
};

export function valueOptionsFromPaletteData(data: PaletteData): FilterBuilderValueOptions {
  return {
    status: ["pending", "accepted", "relabeled", "rejected", "skipped"],
    final_label: data.filterValues.finalLabels,
    prev_label: data.filterValues.prevLabels,
    source: data.sources,
    confidence: [],
    reason: data.reasons,
    issue_type: data.issueTypes,
  };
}

export function openFilterBuilder(data: PaletteData): FilterBuilderState {
  const state: FilterBuilderState = {
    rows: [
      {
        column: "source",
        operator: "=",
        value: firstOrBlank(data.sources),
        values: [],
        valueCursor: 0,
        join: "and",
      },
    ],
    activeRow: 0,
    activeCell: "column",
    revision: 0,
    preview: { kind: "pending" },
    valueOptions: valueOptionsFromPaletteData(data),
  };
  return nextRevision(state);
}

function firstOrBlank(values: string[]): string {
  return values[0] ?? "";
}

function packed(state: FilterBuilderState): Overlay {
  return { kind: "filter-builder", state };
}

export function reduceFilterBuilder(state: FilterBuilderState, event: OverlayEvent): ReduceResult {
  if (event.kind === "cancel") return { overlay: null, effects: [{ kind: "close" }] };
  if (event.kind === "commit") return commit(state);
  if (event.kind !== "key") return { overlay: packed(state), effects: [] };

  const name = event.event.name;
  if (specialKey(name, "escape")) return { overlay: null, effects: [{ kind: "close" }] };
  if (specialKey(name, "return")) return commit(state);
  if (specialKey(name, "left")) return { overlay: packed(moveCell(state, -1)), effects: [] };
  if (specialKey(name, "right") || specialKey(name, "tab"))
    return { overlay: packed(moveCell(state, 1)), effects: [] };
  if (isOverlayRowNext(event.event, event.preset))
    return { overlay: packed(moveRow(state, 1)), effects: [] };
  if (isOverlayRowPrev(event.event, event.preset))
    return { overlay: packed(moveRow(state, -1)), effects: [] };
  if (specialKey(name, "up")) return update(state, cycleCurrent(state, -1));
  if (specialKey(name, "down")) return update(state, cycleCurrent(state, 1));
  if (state.activeCell !== "value" && name === "a") return update(state, setJoin(state, "and"));
  if (state.activeCell !== "value" && name === "o") return update(state, setJoin(state, "or"));
  if (state.activeCell !== "value" && name === "+") return update(state, addRow(state));
  if (specialKey(name, "backspace")) {
    if (state.activeCell === "value") return update(state, editValue(state, "backspace"));
    if (state.rows.length > 1) return update(state, removeRow(state));
  }
  if (state.activeCell === "value" && name === "space" && activeRow(state).operator === "in") {
    return update(state, toggleInValue(state));
  }

  const ch = name === "space" ? " " : name;
  if (
    state.activeCell === "value" &&
    ch.length === 1 &&
    ch >= " " &&
    ch < "\x7f" &&
    !event.event.ctrl
  ) {
    return update(state, editValue(state, ch));
  }

  return { overlay: packed(state), effects: [] };
}

function specialKey(name: string, expected: string): boolean {
  return name === expected || name === expected.toUpperCase();
}

function update(_previous: FilterBuilderState, next: FilterBuilderState): ReduceResult {
  const state = nextRevision(next);
  const predicate = stateToPredicate(state);
  return {
    overlay: packed(state),
    effects: predicate
      ? [{ kind: "scheduleFilterPreview", predicate, revision: state.revision }]
      : [],
  };
}

function nextRevision(state: FilterBuilderState): FilterBuilderState {
  return { ...state, revision: state.revision + 1, preview: { kind: "pending" } };
}

function moveCell(state: FilterBuilderState, delta: -1 | 1): FilterBuilderState {
  const cells: FilterBuilderCell[] = ["column", "operator", "value"];
  const idx = cells.indexOf(state.activeCell);
  return { ...state, activeCell: cells[Math.max(0, Math.min(cells.length - 1, idx + delta))]! };
}

function moveRow(state: FilterBuilderState, delta: -1 | 1): FilterBuilderState {
  return {
    ...state,
    activeRow: Math.max(0, Math.min(state.rows.length - 1, state.activeRow + delta)),
  };
}

function cycleCurrent(state: FilterBuilderState, delta: -1 | 1): FilterBuilderState {
  switch (state.activeCell) {
    case "column":
      return cycleColumn(state, delta);
    case "operator":
      return cycleOperator(state, delta);
    case "value":
      return cycleValue(state, delta);
  }
}

function cycleColumn(state: FilterBuilderState, delta: -1 | 1): FilterBuilderState {
  const row = state.rows[state.activeRow]!;
  const idx = BUILDER_COLUMNS.indexOf(row.column as (typeof BUILDER_COLUMNS)[number]);
  const column = BUILDER_COLUMNS[wrap(idx, BUILDER_COLUMNS.length, delta)]!;
  const operator = operatorsForColumn(column).includes(row.operator)
    ? row.operator
    : operatorsForColumn(column)[0]!;
  return replaceActiveRow(state, {
    ...row,
    column,
    operator,
    value: firstOrBlank(state.valueOptions[column]),
    values: [],
    valueCursor: 0,
  });
}

function cycleOperator(state: FilterBuilderState, delta: -1 | 1): FilterBuilderState {
  const row = state.rows[state.activeRow]!;
  const ops = operatorsForColumn(row.column);
  const idx = ops.indexOf(row.operator);
  const operator = ops[wrap(idx, ops.length, delta)]!;
  const selected = row.operator === "in" ? row.values : row.value ? [row.value] : [];
  return replaceActiveRow(state, {
    ...row,
    operator,
    value: operator === "in" ? row.value : (selected[0] ?? row.value),
    values: operator === "in" ? selected : [],
    valueCursor: 0,
  });
}

function cycleValue(state: FilterBuilderState, delta: -1 | 1): FilterBuilderState {
  const row = state.rows[state.activeRow]!;
  const values = state.valueOptions[row.column];
  if (values.length === 0) return state;
  if (row.operator === "in") {
    return replaceActiveRow(state, {
      ...row,
      valueCursor: wrap(row.valueCursor, values.length, delta),
    });
  }
  const idx = Math.max(0, values.indexOf(row.value));
  const valueCursor = wrap(idx, values.length, delta);
  return replaceActiveRow(state, { ...row, value: values[valueCursor]!, valueCursor });
}

function wrap(idx: number, length: number, delta: -1 | 1): number {
  return (idx + delta + length) % length;
}

function setJoin(state: FilterBuilderState, join: FilterBuilderJoin): FilterBuilderState {
  const target = state.activeRow + 1;
  if (target >= state.rows.length) {
    return addRow(state, join);
  }
  const rows = state.rows.slice();
  rows[target] = { ...rows[target]!, join };
  return { ...state, rows };
}

function addRow(state: FilterBuilderState, join: FilterBuilderJoin = "and"): FilterBuilderState {
  const row: FilterBuilderRow = {
    column: "source",
    operator: "=",
    value: firstOrBlank(state.valueOptions.source),
    values: [],
    valueCursor: 0,
    join,
  };
  const rows = state.rows.slice();
  rows.splice(state.activeRow + 1, 0, row);
  return { ...state, rows, activeRow: state.activeRow + 1, activeCell: "column" };
}

function removeRow(state: FilterBuilderState): FilterBuilderState {
  const rows = state.rows.slice();
  rows.splice(state.activeRow, 1);
  return { ...state, rows, activeRow: Math.max(0, state.activeRow - 1) };
}

function editValue(state: FilterBuilderState, input: string): FilterBuilderState {
  const row = state.rows[state.activeRow]!;
  if (row.operator === "in") {
    return input === "backspace" ? removeHighlightedInValue(state) : state;
  }
  const value = input === "backspace" ? row.value.slice(0, -1) : row.value + input;
  return replaceActiveRow(state, { ...row, value });
}

function activeRow(state: FilterBuilderState): FilterBuilderRow {
  return state.rows[state.activeRow]!;
}

function toggleInValue(state: FilterBuilderState): FilterBuilderState {
  const row = activeRow(state);
  const values = state.valueOptions[row.column];
  const value = values[row.valueCursor];
  if (!value) return state;
  const selected = row.values;
  const nextSelected = selected.includes(value)
    ? selected.filter((v) => v !== value)
    : [...selected, value];
  return replaceActiveRow(state, { ...row, values: nextSelected });
}

function removeHighlightedInValue(state: FilterBuilderState): FilterBuilderState {
  const row = activeRow(state);
  const value = state.valueOptions[row.column][row.valueCursor];
  if (!value) return state;
  return replaceActiveRow(state, {
    ...row,
    values: row.values.filter((v) => v !== value),
  });
}

export function selectedValues(row: FilterBuilderRow): string[] {
  return row.operator === "in" ? row.values : row.value ? [row.value] : [];
}

function replaceActiveRow(state: FilterBuilderState, row: FilterBuilderRow): FilterBuilderState {
  const rows = state.rows.slice();
  rows[state.activeRow] = row;
  return { ...state, rows };
}

function commit(state: FilterBuilderState): ReduceResult {
  const predicate = stateToPredicate(state);
  if (!predicate) {
    return {
      overlay: packed({
        ...state,
        preview: { kind: "error", message: "choose or type a valid value before applying" },
      }),
      effects: [],
    };
  }
  const expr = serializePredicate(predicate);
  return {
    overlay: null,
    effects: [
      { kind: "close" },
      { kind: "pushPaletteHistory", entry: `where ${expr}` },
      { kind: "runCommand", commandName: "palette.where", argument: expr },
    ],
  };
}

export function stateToPredicate(state: FilterBuilderState): Predicate | null {
  if (state.rows.length === 0) return null;
  let predicate: Predicate | null = null;
  for (const row of state.rows) {
    const next = rowToPredicate(row);
    if (!next) return null;
    predicate = predicate
      ? row.join === "or"
        ? { kind: "or", left: predicate, right: next }
        : { kind: "and", left: predicate, right: next }
      : next;
  }
  return predicate;
}

function rowToPredicate(row: FilterBuilderRow): Predicate | null {
  if (row.operator === "in") {
    const values = row.values.map((v) => parseValue(row.column, v)).filter((v) => v !== null);
    if (values.length === 0) return null;
    return { kind: "in", column: row.column, values };
  }
  if (row.value.trim().length === 0) return null;
  const value = parseValue(row.column, row.value.trim());
  if (value === null) return null;
  return { kind: "comparison", column: row.column, operator: row.operator, value };
}

function parseValue(column: PredicateColumn, raw: string): PredicateValue | null {
  if (raw.length === 0) return null;
  if (column === "confidence") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return raw;
}
