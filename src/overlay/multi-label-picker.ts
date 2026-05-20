import { encodeLabelSet, labelSetsEqual } from "../labels/label-set.ts";
import { filterLabels } from "../picker/filter.ts";
import { keepPrintableInputChars } from "./input-filter.ts";
import { isOverlayNext, isOverlayPrev } from "./key-match.ts";
import type { Effect, Overlay, OverlayEvent, PickerLabel, ReduceResult } from "./types.ts";

export type MultiLabelPickerCandidate = {
  label: string;
  predicted: boolean;
  selected: boolean;
  key?: string;
};

export type MultiLabelPickerState = {
  recordId: string;
  allLabels: PickerLabel[];
  /** Canonical predicted set (config-order). */
  predicted: string[];
  /** Currently selected set (config-order). */
  selected: string[];
  predictedConfidence: number | null;
  filter: string;
  candidates: MultiLabelPickerCandidate[];
  highlight: number;
  /** Sticky source-of-truth tag — set true when the overlay was opened over
   * an already-viewed-assistant record OR a future event marks it. Today
   * defaults false; the open-action thread it from app.viewedAssistant. */
  assistantViewed: boolean;
};

export type OpenMultiLabelPickerArgs = {
  recordId: string;
  allLabels: PickerLabel[];
  predicted: string[];
  predictedConfidence: number | null;
  assistantViewed?: boolean;
};

function buildCandidates(
  allLabels: PickerLabel[],
  filter: string,
  predicted: string[],
  selected: string[],
): MultiLabelPickerCandidate[] {
  const names = allLabels.map((l) => l.name);
  const visible = filter.length === 0 ? names.slice() : filterLabels(names, filter);
  const byName = new Map(allLabels.map((l) => [l.name, l]));
  const predictedSet = new Set(predicted);
  const selectedSet = new Set(selected);
  return visible.map((name) => {
    const entry = byName.get(name);
    return {
      label: name,
      predicted: predictedSet.has(name),
      selected: selectedSet.has(name),
      ...(entry?.key ? { key: entry.key } : {}),
    };
  });
}

function sortByConfig(allLabels: PickerLabel[], items: string[]): string[] {
  const order = new Map(allLabels.map((l, i) => [l.name, i]));
  return [...items].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

export function openMultiLabelPicker(args: OpenMultiLabelPickerArgs): MultiLabelPickerState {
  const predicted = sortByConfig(args.allLabels, args.predicted);
  const selected = predicted.slice();
  const candidates = buildCandidates(args.allLabels, "", predicted, selected);
  return {
    recordId: args.recordId,
    allLabels: args.allLabels,
    predicted,
    selected,
    predictedConfidence: args.predictedConfidence,
    filter: "",
    candidates,
    highlight: 0,
    assistantViewed: args.assistantViewed ?? false,
  };
}

function packed(state: MultiLabelPickerState): Overlay {
  return { kind: "multi-label-picker", state };
}

function withSelected(state: MultiLabelPickerState, selected: string[]): MultiLabelPickerState {
  const sorted = sortByConfig(state.allLabels, selected);
  return {
    ...state,
    selected: sorted,
    candidates: buildCandidates(state.allLabels, state.filter, state.predicted, sorted),
  };
}

function withFilter(state: MultiLabelPickerState, filter: string): MultiLabelPickerState {
  return {
    ...state,
    filter,
    candidates: buildCandidates(state.allLabels, filter, state.predicted, state.selected),
    highlight: 0,
  };
}

function toggle(state: MultiLabelPickerState, label: string): MultiLabelPickerState {
  const has = state.selected.includes(label);
  const next = has ? state.selected.filter((l) => l !== label) : [...state.selected, label];
  return withSelected(state, next);
}

function commit(state: MultiLabelPickerState): ReduceResult {
  if (state.selected.length === 0) {
    // Empty set is invalid — reject would be the right action. Keep overlay
    // open so the reviewer recovers via Esc or Space.
    return { overlay: packed(state), effects: [] };
  }
  const status = labelSetsEqual(state.selected, state.predicted) ? "accepted" : "relabeled";
  const finalLabel = encodeLabelSet(state.selected);
  const prevLabel = status === "relabeled" ? encodeLabelSet(state.predicted) : null;
  const sourceOfTruth = state.assistantViewed ? "human+assistant" : "human";
  const effects: Effect[] = [
    {
      kind: "commitDecision",
      recordId: state.recordId,
      status,
      finalLabel,
      prevLabel,
      sourceOfTruth,
    },
    { kind: "close" },
  ];
  return { overlay: null, effects };
}

export function reduceMultiLabelPicker(
  state: MultiLabelPickerState,
  event: OverlayEvent,
): ReduceResult {
  switch (event.kind) {
    case "cancel":
      return { overlay: null, effects: [{ kind: "close" }] };
    case "commit":
      return commit(state);
    case "key":
      return reduceKey(state, event);
    case "streamToken":
    case "streamEnd":
    case "streamError":
      return { overlay: packed(state), effects: [] };
    case "paste":
      return {
        overlay: packed(
          withFilter(
            state,
            state.filter + keepPrintableInputChars(event.text.replace(/[\r\n]+/g, " ")),
          ),
        ),
        effects: [],
      };
  }
}

function reduceKey(
  state: MultiLabelPickerState,
  evt: Extract<OverlayEvent, { kind: "key" }>,
): ReduceResult {
  const name = evt.event.name;
  if (name === "escape") return { overlay: null, effects: [{ kind: "close" }] };
  if (name === "return") return commit(state);
  if (name === "space") {
    const candidate = state.candidates[state.highlight];
    if (!candidate) return { overlay: packed(state), effects: [] };
    return { overlay: packed(toggle(state, candidate.label)), effects: [] };
  }
  if (isOverlayPrev(evt.event, evt.preset)) {
    if (state.candidates.length === 0) return { overlay: packed(state), effects: [] };
    return {
      overlay: packed({ ...state, highlight: Math.max(state.highlight - 1, 0) }),
      effects: [],
    };
  }
  if (isOverlayNext(evt.event, evt.preset)) {
    if (state.candidates.length === 0) return { overlay: packed(state), effects: [] };
    return {
      overlay: packed({
        ...state,
        highlight: Math.min(state.highlight + 1, state.candidates.length - 1),
      }),
      effects: [],
    };
  }
  if (name === "backspace") {
    return { overlay: packed(withFilter(state, state.filter.slice(0, -1))), effects: [] };
  }
  const ch = name;
  if (ch.length === 1 && /^[1-9]$/.test(ch)) {
    const n = Number(ch);
    if (n < 1 || n > state.candidates.length) return { overlay: packed(state), effects: [] };
    return { overlay: packed({ ...state, highlight: n - 1 }), effects: [] };
  }
  if (ch.length === 1) {
    const idx = state.candidates.findIndex((c) => c.key === ch);
    if (idx >= 0) {
      const candidate = state.candidates[idx]!;
      return {
        overlay: packed(toggle({ ...state, highlight: idx }, candidate.label)),
        effects: [],
      };
    }
  }
  if (ch.length === 1 && /^[\w \-_]$/.test(ch)) {
    return { overlay: packed(withFilter(state, state.filter + ch)), effects: [] };
  }
  return { overlay: packed(state), effects: [], propagated: true };
}
