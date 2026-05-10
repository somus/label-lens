import type { Command } from "../actions/command.ts";
import type { Scope } from "../keymap/engine.ts";
import type { Overlay, OverlayEvent, ReduceResult } from "./types.ts";

export type PaletteEntry = {
  commandName: string;
  palette: string;
};

export type PaletteState = {
  filter: string;
  entries: PaletteEntry[];
  highlight: number;
  historyIdx: number | null;
  history: string[];
  allEntries: PaletteEntry[];
};

export type OpenPaletteArgs = {
  commands: Command[];
  history: string[];
  scope: Scope;
};

export function openPalette(args: OpenPaletteArgs): PaletteState {
  const entries: PaletteEntry[] = [];
  for (const c of args.commands) {
    if (!c.palette) continue;
    if (c.hidden) continue;
    if (c.scope !== args.scope && c.scope !== "global") continue;
    entries.push({ commandName: c.name, palette: c.palette });
  }
  return {
    filter: "",
    entries: filteredEntries(entries, ""),
    highlight: 0,
    historyIdx: null,
    history: args.history.slice(),
    allEntries: entries,
  };
}

function filteredEntries(entries: PaletteEntry[], filter: string): PaletteEntry[] {
  if (filter.length === 0) return entries.slice();
  const sp = filter.indexOf(" ");
  const stem = sp === -1 ? filter : filter.slice(0, sp);
  if (stem.length === 0) return entries.slice();
  const needle = stem.toLowerCase();
  return entries.filter((e) => stemOf(e.palette).toLowerCase().startsWith(needle));
}

function stemOf(palette: string): string {
  return palette.startsWith(":") ? palette.slice(1) : palette;
}

function packed(state: PaletteState): Overlay {
  return { kind: "palette", state };
}

function cycleHistory(state: PaletteState, direction: -1 | 1): ReduceResult {
  if (state.history.length === 0) return { overlay: packed(state), effects: [] };
  const inHistory = state.historyIdx !== null;
  if (direction === -1) {
    const nextIdx = inHistory ? Math.max(state.historyIdx! - 1, 0) : state.history.length - 1;
    const recalled = state.history[nextIdx]!;
    return {
      overlay: packed({
        ...state,
        historyIdx: nextIdx,
        filter: recalled,
        entries: filteredEntries(state.allEntries, recalled),
        highlight: 0,
      }),
      effects: [],
    };
  }
  if (!inHistory) return { overlay: packed(state), effects: [] };
  const nextIdx = state.historyIdx! + 1;
  if (nextIdx >= state.history.length) {
    return {
      overlay: packed({
        ...state,
        historyIdx: null,
        filter: "",
        entries: filteredEntries(state.allEntries, ""),
        highlight: 0,
      }),
      effects: [],
    };
  }
  const recalled = state.history[nextIdx]!;
  return {
    overlay: packed({
      ...state,
      historyIdx: nextIdx,
      filter: recalled,
      entries: filteredEntries(state.allEntries, recalled),
      highlight: 0,
    }),
    effects: [],
  };
}

function commit(state: PaletteState): ReduceResult {
  const entry = state.entries[state.highlight];
  if (!entry) return { overlay: packed(state), effects: [] };
  const sp = state.filter.indexOf(" ");
  const argRaw = sp === -1 ? "" : state.filter.slice(sp + 1).trim();
  const argument = argRaw.length === 0 ? undefined : argRaw;
  // Close BEFORE dispatch: a palette command may itself open a new overlay
  // (e.g. `:guidelines` → guidelines overlay) and a trailing `close` would
  // clobber it.
  return {
    overlay: null,
    effects: [
      { kind: "close" },
      { kind: "pushPaletteHistory", entry: state.filter },
      { kind: "runCommand", commandName: entry.commandName, argument },
    ],
  };
}

function withFilter(state: PaletteState, filter: string): PaletteState {
  return {
    ...state,
    filter,
    entries: filteredEntries(state.allEntries, filter),
    highlight: 0,
    historyIdx: null,
  };
}

export function reducePalette(state: PaletteState, event: OverlayEvent): ReduceResult {
  if (event.kind === "cancel") return { overlay: null, effects: [{ kind: "close" }] };
  if (event.kind === "commit") return commit(state);
  if (event.kind !== "key") return { overlay: packed(state), effects: [] };
  const name = event.event.name;
  if (name === "escape") return { overlay: null, effects: [{ kind: "close" }] };
  if (name === "return") return commit(state);
  if (name === "down") {
    if (state.entries.length === 0) return { overlay: packed(state), effects: [] };
    return {
      overlay: packed({
        ...state,
        highlight: Math.min(state.highlight + 1, state.entries.length - 1),
      }),
      effects: [],
    };
  }
  // ctrl+p / ctrl+n cycle session history; arrow keys are reserved for
  // entry-list navigation so the palette behaves like fzf / readline.
  if (event.event.ctrl && (name === "p" || name === "n")) {
    return cycleHistory(state, name === "p" ? -1 : 1);
  }
  if (name === "up") {
    if (state.entries.length === 0) return { overlay: packed(state), effects: [] };
    return {
      overlay: packed({ ...state, highlight: Math.max(state.highlight - 1, 0) }),
      effects: [],
    };
  }
  if (name === "backspace") {
    return { overlay: packed(withFilter(state, state.filter.slice(0, -1))), effects: [] };
  }
  const ch = name === "space" ? " " : name;
  // Accept any printable ASCII so `:where source = 'llm:gpt-4' and …` and
  // similar PRD-spec inputs typecheck through the palette. Single char plus
  // ctrl-modifier-free (so ctrl+p stays a navigation key).
  if (ch.length === 1 && ch >= " " && ch < "\x7f" && !event.event.ctrl) {
    return { overlay: packed(withFilter(state, state.filter + ch)), effects: [] };
  }
  return { overlay: packed(state), effects: [] };
}
