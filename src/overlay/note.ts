import type { KeyEvent } from "../keymap/engine.ts";
import type { NoteState, Overlay, OverlayEvent, ReduceResult } from "./types.ts";

export type OpenNoteArgs = {
  recordId: string;
  initial: string;
  presets?: readonly string[];
};

export function openNote(args: OpenNoteArgs): NoteState {
  return {
    recordId: args.recordId,
    value: args.initial,
    // Trim blanks first so a stray whitespace entry doesn't steal a slot, then
    // cap at 9 — only digits 1-9 are bound. Over-eager configs lose tail entries
    // silently rather than erroring.
    presets: (args.presets ?? [])
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .slice(0, 9),
  };
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
      return reduceKey(state, event.event);
    case "streamToken":
    case "streamEnd":
    case "streamError":
      return { overlay: packed(state), effects: [] };
    case "paste":
      // Strip stray ESC/control chars (bracketed-paste residue); preserve
      // newlines so multi-line notes round-trip clipboard intact.
      return {
        overlay: packed({
          ...state,
          value: state.value + event.text.split("").filter(isNoteInputChar).join(""),
        }),
        effects: [],
      };
  }
}

function isNoteInputChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  // Keep tab + newlines + carriage return + every printable char. Drop other
  // C0 controls + DEL.
  if (code === 0x09 || code === 0x0a || code === 0x0d) return true;
  return code >= 0x20 && code !== 0x7f;
}

function reduceKey(state: NoteState, event: KeyEvent): ReduceResult {
  const name = event.name;
  if (name === "escape") return { overlay: null, effects: [{ kind: "close" }] };
  if (name === "return") {
    // shift+enter inserts a newline; plain enter commits. Plan G2.
    if (event.shift) {
      return { overlay: packed({ ...state, value: `${state.value}\n` }), effects: [] };
    }
    return commit(state);
  }
  if (name === "backspace") {
    return { overlay: packed({ ...state, value: state.value.slice(0, -1) }), effects: [] };
  }
  // Alt+digit attaches the matching preset. We branch on `meta` because OpenTUI
  // emits Alt as meta; plain digits stay free for the reviewer to type counts.
  // Always swallow the chord (even when the preset slot is empty) so the
  // digit doesn't leak into the value.
  if (event.meta && name.length === 1 && name >= "1" && name <= "9") {
    const idx = Number(name) - 1;
    const preset = state.presets[idx];
    if (!preset) return { overlay: packed(state), effects: [] };
    const sep = state.value.length === 0 || state.value.endsWith("\n") ? "" : " ";
    return {
      overlay: packed({ ...state, value: `${state.value}${sep}${preset}` }),
      effects: [],
    };
  }
  // OpenTUI emits "space" for the spacebar; treat as a printable char.
  const ch = name === "space" ? " " : name;
  if (ch.length === 1 && ch >= " " && ch <= "~") {
    return { overlay: packed({ ...state, value: state.value + ch }), effects: [] };
  }
  return { overlay: packed(state), effects: [] };
}
