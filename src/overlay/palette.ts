import type { Command } from "../actions/command.ts";
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
};

export function openPalette(args: OpenPaletteArgs): PaletteState {
  const entries: PaletteEntry[] = [];
  for (const c of args.commands) {
    if (!c.palette) continue;
    if (c.hidden) continue;
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

function commit(state: PaletteState): ReduceResult {
  const entry = state.entries[state.highlight];
  if (!entry) return { overlay: packed(state), effects: [] };
  const sp = state.filter.indexOf(" ");
  const argRaw = sp === -1 ? "" : state.filter.slice(sp + 1).trim();
  const argument = argRaw.length === 0 ? undefined : argRaw;
  return {
    overlay: null,
    effects: [
      { kind: "runCommand", commandName: entry.commandName, argument },
      { kind: "pushPaletteHistory", entry: state.filter },
      { kind: "close" },
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
  if (name === "up") {
    const inHistory = state.historyIdx !== null;
    const enterHistory = !inHistory && state.filter.length === 0 && state.history.length > 0;
    if (inHistory || enterHistory) {
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
  if (ch.length === 1 && /^[\w \-_:.]$/.test(ch)) {
    return { overlay: packed(withFilter(state, state.filter + ch)), effects: [] };
  }
  return { overlay: packed(state), effects: [] };
}
