import type { PickerCandidate, PickerState } from "../app/context.ts";
import { filterLabels } from "./filter.ts";

export type PickerEvent =
  | { kind: "char"; char: string }
  | { kind: "backspace" }
  | { kind: "up" }
  | { kind: "down" }
  | { kind: "number"; n: number };

export function initialPicker(allLabels: string[], predicted: string | null): PickerState {
  const candidates = allLabels.map((label) => ({ label, predicted: label === predicted }));
  const idx = candidates.findIndex((c) => c.predicted);
  return {
    recordId: "",
    allLabels,
    predicted,
    filter: "",
    candidates,
    highlight: idx >= 0 ? idx : 0,
  };
}

function recomputeCandidates(state: PickerState, filter: string): PickerState {
  const filtered = filterLabels(state.allLabels, filter);
  const candidates: PickerCandidate[] = filtered.map((label) => ({
    label,
    predicted: label === state.predicted,
  }));
  return { ...state, filter, candidates, highlight: 0 };
}

export function pickerReduce(state: PickerState, event: PickerEvent): PickerState {
  switch (event.kind) {
    case "char":
      return recomputeCandidates(state, state.filter + event.char);
    case "backspace":
      return recomputeCandidates(state, state.filter.slice(0, -1));
    case "down": {
      if (state.candidates.length === 0) return state;
      return { ...state, highlight: Math.min(state.highlight + 1, state.candidates.length - 1) };
    }
    case "up": {
      if (state.candidates.length === 0) return state;
      return { ...state, highlight: Math.max(state.highlight - 1, 0) };
    }
    case "number": {
      if (event.n < 1 || event.n > state.candidates.length) return state;
      return { ...state, highlight: event.n - 1 };
    }
  }
}
