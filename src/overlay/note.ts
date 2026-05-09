import type { NoteState, Overlay, OverlayEvent, ReduceResult } from "./types.ts";

export type OpenNoteArgs = {
  recordId: string;
  initial: string;
};

export function openNote(args: OpenNoteArgs): NoteState {
  return { recordId: args.recordId, value: args.initial };
}

function packed(state: NoteState): Overlay {
  return { kind: "note", state };
}

function commit(state: NoteState): ReduceResult {
  return {
    overlay: null,
    effects: [
      { kind: "updateNote", recordId: state.recordId, value: state.value },
      { kind: "close" },
    ],
  };
}

export function reduceNote(state: NoteState, event: OverlayEvent): ReduceResult {
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

function reduceKey(state: NoteState, name: string): ReduceResult {
  if (name === "escape") return { overlay: null, effects: [{ kind: "close" }] };
  if (name === "return") return commit(state);
  if (name === "backspace") {
    return { overlay: packed({ ...state, value: state.value.slice(0, -1) }), effects: [] };
  }
  // OpenTUI emits "space" for the spacebar; treat as a printable char.
  const ch = name === "space" ? " " : name;
  if (ch.length === 1 && ch >= " " && ch <= "~") {
    return { overlay: packed({ ...state, value: state.value + ch }), effects: [] };
  }
  return { overlay: packed(state), effects: [] };
}
