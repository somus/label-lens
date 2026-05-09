import { filterLabels } from "../picker/filter.ts";
import type {
  Effect,
  Overlay,
  OverlayEvent,
  PickerCandidate,
  PickerState,
  ReduceResult,
} from "./types.ts";

export type OpenPickerArgs = {
  recordId: string;
  allLabels: string[];
  predicted: string | null;
};

export function openPicker(args: OpenPickerArgs): PickerState {
  const candidates = candidatesFrom(args.allLabels, "", args.predicted);
  const idx = candidates.findIndex((c) => c.predicted);
  return {
    recordId: args.recordId,
    allLabels: args.allLabels,
    predicted: args.predicted,
    filter: "",
    candidates,
    highlight: idx >= 0 ? idx : 0,
  };
}

function candidatesFrom(
  allLabels: string[],
  filter: string,
  predicted: string | null,
): PickerCandidate[] {
  const labels = filter.length === 0 ? allLabels.slice() : filterLabels(allLabels, filter);
  return labels.map((label) => ({ label, predicted: label === predicted }));
}

function withFilter(state: PickerState, filter: string): PickerState {
  return {
    ...state,
    filter,
    candidates: candidatesFrom(state.allLabels, filter, state.predicted),
    highlight: 0,
  };
}

function packed(state: PickerState): Overlay {
  return { kind: "picker", state };
}

function commit(state: PickerState): ReduceResult {
  const candidate = state.candidates[state.highlight];
  // No candidate to commit — Enter is a no-op so the user can keep the typed
  // filter and recover via Backspace. Esc is the explicit cancel.
  if (!candidate) return { overlay: packed(state), effects: [] };
  const status = candidate.predicted ? "accepted" : "relabeled";
  const effects: Effect[] = [
    {
      kind: "commitDecision",
      recordId: state.recordId,
      status,
      finalLabel: candidate.label,
      prevLabel: status === "relabeled" ? state.predicted : null,
      sourceOfTruth: "human",
    },
    { kind: "close" },
  ];
  return { overlay: null, effects };
}

export function reducePicker(state: PickerState, event: OverlayEvent): ReduceResult {
  switch (event.kind) {
    case "cancel":
      return { overlay: null, effects: [{ kind: "close" }] };
    case "commit":
      return commit(state);
    case "key":
      return reduceKey(state, event.event.name);
    case "streamToken":
    case "streamEnd":
    case "streamError":
      return { overlay: packed(state), effects: [] };
  }
}

function reduceKey(state: PickerState, name: string): ReduceResult {
  if (name === "escape") return { overlay: null, effects: [{ kind: "close" }] };
  if (name === "return") return commit(state);
  if (name === "up") {
    if (state.candidates.length === 0) return { overlay: packed(state), effects: [] };
    return {
      overlay: packed({ ...state, highlight: Math.max(state.highlight - 1, 0) }),
      effects: [],
    };
  }
  if (name === "down") {
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
  // OpenTUI emits "space" for the spacebar; treat as a printable char.
  const ch = name === "space" ? " " : name;
  if (ch.length === 1 && /^[1-9]$/.test(ch)) {
    const n = Number(ch);
    if (n < 1 || n > state.candidates.length) return { overlay: packed(state), effects: [] };
    return { overlay: packed({ ...state, highlight: n - 1 }), effects: [] };
  }
  if (ch.length === 1 && /^[\w \-_]$/.test(ch)) {
    return { overlay: packed(withFilter(state, state.filter + ch)), effects: [] };
  }
  return { overlay: packed(state), effects: [] };
}
