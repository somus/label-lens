import { filterLabels } from "../picker/filter.ts";
import { keepPrintableInputChars } from "./input-filter.ts";
import { isOverlayNext, isOverlayPrev } from "./key-match.ts";
import type {
  Effect,
  Overlay,
  OverlayEvent,
  PickerCandidate,
  PickerLabel,
  PickerState,
  ReduceResult,
} from "./types.ts";

export type OpenPickerArgs = {
  recordId: string;
  allLabels: PickerLabel[];
  predicted: string | null;
  predictedConfidence: number | null;
};

export function openPicker(args: OpenPickerArgs): PickerState {
  const candidates = candidatesFrom(args.allLabels, "", args.predicted, args.predictedConfidence);
  const idx = candidates.findIndex((c) => c.predicted);
  return {
    recordId: args.recordId,
    allLabels: args.allLabels,
    predicted: args.predicted,
    predictedConfidence: args.predictedConfidence,
    filter: "",
    candidates,
    highlight: idx >= 0 ? idx : 0,
  };
}

function candidatesFrom(
  allLabels: PickerLabel[],
  filter: string,
  predicted: string | null,
  predictedConfidence: number | null,
): PickerCandidate[] {
  const names = allLabels.map((l) => l.name);
  const visible = filter.length === 0 ? names.slice() : filterLabels(names, filter);
  const byName = new Map(allLabels.map((l) => [l.name, l]));
  return visible.map((name) => {
    const entry = byName.get(name);
    return {
      label: name,
      predicted: name === predicted,
      confidence: name === predicted ? predictedConfidence : null,
      ...(entry?.key ? { key: entry.key } : {}),
    };
  });
}

function withFilter(state: PickerState, filter: string): PickerState {
  return {
    ...state,
    filter,
    candidates: candidatesFrom(state.allLabels, filter, state.predicted, state.predictedConfidence),
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
      return reduceKey(state, event);
    case "streamToken":
    case "streamEnd":
    case "streamError":
      return { overlay: packed(state), effects: [] };
    case "paste":
      // Append printable chars from the paste into the filter. Newlines /
      // control chars dropped so a stray multiline clipboard doesn't break
      // the filter row. Shares the auth-step's filter so label names with
      // colons / slashes (e.g. "policy:spam") survive pasting.
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

function reduceKey(state: PickerState, evt: Extract<OverlayEvent, { kind: "key" }>): ReduceResult {
  const name = evt.event.name;
  if (name === "escape") return { overlay: null, effects: [{ kind: "close" }] };
  if (name === "return") return commit(state);
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
  // OpenTUI emits "space" for the spacebar; treat as a printable char.
  const ch = name === "space" ? " " : name;
  if (ch.length === 1 && /^[1-9]$/.test(ch)) {
    const n = Number(ch);
    if (n < 1 || n > state.candidates.length) return { overlay: packed(state), effects: [] };
    return { overlay: packed({ ...state, highlight: n - 1 }), effects: [] };
  }
  // Configured per-label key (`config.labels[].key`) commits the matching
  // candidate. Checked before the filter-typing branch so a key like `f`
  // accelerates instead of typing into the filter.
  if (ch.length === 1) {
    const idx = state.candidates.findIndex((c) => c.key === ch);
    if (idx >= 0) return commit({ ...state, highlight: idx });
  }
  if (ch.length === 1 && /^[\w \-_]$/.test(ch)) {
    return { overlay: packed(withFilter(state, state.filter + ch)), effects: [] };
  }
  return { overlay: packed(state), effects: [], propagated: true };
}
