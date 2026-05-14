import type { Command } from "../actions/command.ts";
import type { Scope } from "../keymap/engine.ts";
import type { Db } from "../store/db.ts";
import type { PaletteData } from "../store/palette-data.ts";
import { fetchPaletteData } from "../store/palette-data.ts";
import { type CategoryGroup, categorize, flattenForNav } from "./palette-categories.ts";
import { openPicker, type PickerField, reducePicker } from "./palette-picker.ts";
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
  mode: "browse" | "pick";
  categories: CategoryGroup[];
  picker: PickerField | null;
  counts: Map<string, number>;
  pickerOptions: PaletteData | null;
  commands: Command[];
};

export type OpenPaletteArgs = {
  commands: Command[];
  history: string[];
  scope: Scope;
};

export function openPalette(args: OpenPaletteArgs): PaletteState {
  const rawEntries: PaletteEntry[] = [];
  for (const c of args.commands) {
    if (!c.palette) continue;
    if (c.hidden) continue;
    if (c.scope !== args.scope && c.scope !== "global") continue;
    rawEntries.push({ commandName: c.name, palette: c.palette });
  }
  const categories = categorize(rawEntries, args.commands);
  const entries = flattenForNav(categories).map((n) => n.entry);
  return {
    filter: "",
    entries: filteredEntries(entries, ""),
    highlight: 0,
    historyIdx: null,
    history: args.history.slice(),
    allEntries: entries,
    mode: "browse",
    categories,
    picker: null,
    counts: new Map(),
    pickerOptions: null,
    commands: args.commands,
  };
}

export type OpenPaletteV2Args = OpenPaletteArgs & {
  db: Db;
  labels: string[];
};

export function openPaletteV2(args: OpenPaletteV2Args): PaletteState {
  const state = openPalette(args);
  const data = fetchPaletteData(args.db, args.labels);
  return {
    ...state,
    counts: data.counts,
    pickerOptions: data,
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

function recallHistory(
  state: PaletteState,
  historyIdx: number | null,
  filter: string,
): ReduceResult {
  const entries = filteredEntries(state.allEntries, filter);
  return {
    overlay: packed({
      ...state,
      historyIdx,
      filter,
      entries,
      categories: categorize(entries, state.commands),
      highlight: 0,
    }),
    effects: [],
  };
}

function cycleHistory(state: PaletteState, direction: -1 | 1): ReduceResult {
  if (state.history.length === 0) return { overlay: packed(state), effects: [] };
  const inHistory = state.historyIdx !== null;
  if (direction === -1) {
    const nextIdx = inHistory ? Math.max(state.historyIdx! - 1, 0) : state.history.length - 1;
    return recallHistory(state, nextIdx, state.history[nextIdx]!);
  }
  if (!inHistory) return { overlay: packed(state), effects: [] };
  const nextIdx = state.historyIdx! + 1;
  if (nextIdx >= state.history.length) {
    return recallHistory(state, null, "");
  }
  return recallHistory(state, nextIdx, state.history[nextIdx]!);
}

function commitDirect(state: PaletteState): ReduceResult {
  const entry = state.entries[state.highlight];
  if (!entry) return { overlay: packed(state), effects: [] };
  const sp = state.filter.indexOf(" ");
  const argRaw = sp === -1 ? "" : state.filter.slice(sp + 1).trim();
  const argument = argRaw.length === 0 ? undefined : argRaw;
  return {
    overlay: null,
    effects: [
      { kind: "close" },
      { kind: "pushPaletteHistory", entry: state.filter },
      { kind: "runCommand", commandName: entry.commandName, argument },
    ],
  };
}

function tryOpenPicker(state: PaletteState): ReduceResult | null {
  const entry = state.entries[state.highlight];
  if (!entry) return null;

  const cmd = state.commands.find((c) => c.name === entry.commandName);
  if (!cmd?.paletteMetadata) return null;
  if (cmd.paletteMetadata.arity !== 1) return null;

  const sp = state.filter.indexOf(" ");
  const hasArg = sp !== -1 && state.filter.slice(sp + 1).trim().length > 0;
  if (hasArg) return null;

  const kind = cmd.paletteMetadata.pickerKind;

  if (!kind) {
    return {
      overlay: packed({
        ...state,
        mode: "pick",
        picker: openPicker(entry.commandName, "text", []),
      }),
      effects: [],
    };
  }

  if (!state.pickerOptions) return null;
  const data = state.pickerOptions;
  let candidates: string[];
  let candidateCounts: Map<string, number> | undefined;

  switch (kind) {
    case "source":
      candidates = data.sources;
      candidateCounts = data.sourceCounts;
      break;
    case "label":
      candidates = data.labels;
      candidateCounts = data.labelCounts;
      break;
    case "reason":
      candidates = data.reasons;
      break;
    case "issue":
      candidates = data.issueTypes;
      break;
    case "correction":
      candidates = [...new Set(data.corrections.map((c) => c.from))].sort();
      break;
    case "topic":
      candidates = data.topics;
      break;
    case "format":
      candidates = data.formats;
      break;
    case "queue":
      candidates = data.queueNames;
      candidateCounts = data.counts;
      break;
    default:
      return null;
  }

  return {
    overlay: packed({
      ...state,
      mode: "pick",
      picker: openPicker(entry.commandName, kind, candidates, candidateCounts),
    }),
    effects: [],
  };
}

function commit(state: PaletteState): ReduceResult {
  const pickerResult = tryOpenPicker(state);
  if (pickerResult) return pickerResult;
  return commitDirect(state);
}

function withFilter(state: PaletteState, filter: string): PaletteState {
  const newEntries = filteredEntries(state.allEntries, filter);
  return {
    ...state,
    filter,
    entries: newEntries,
    categories: categorize(newEntries, state.commands),
    highlight: 0,
    historyIdx: null,
  };
}

function handlePickerEvent(state: PaletteState, event: OverlayEvent): ReduceResult {
  if (!state.picker) return { overlay: packed(state), effects: [] };

  const result = reducePicker(state.picker, event);

  switch (result.kind) {
    case "back":
      return {
        overlay: packed({ ...state, mode: "browse", picker: null }),
        effects: [],
      };

    case "selected": {
      const stem = stemOf(
        state.entries.find((e) => e.commandName === result.commandName)?.palette ?? "",
      );
      const historyEntry = `${stem} ${result.argument}`;
      return {
        overlay: null,
        effects: [
          { kind: "close" },
          { kind: "pushPaletteHistory", entry: historyEntry },
          { kind: "runCommand", commandName: result.commandName, argument: result.argument },
        ],
      };
    }

    case "updated": {
      const picker = result.picker;
      if (
        picker.step === "to" &&
        picker.candidates.length === 0 &&
        state.pickerOptions?.corrections
      ) {
        const toLabels = state.pickerOptions.corrections
          .filter((c) => c.from === picker.selectedFrom)
          .map((c) => c.to)
          .sort();
        picker.candidates = toLabels;
        picker.allCandidates = toLabels;
      }
      return {
        overlay: packed({ ...state, picker }),
        effects: [],
      };
    }

    case "noop":
      return { overlay: packed(state), effects: [] };
  }
}

export function reducePalette(state: PaletteState, event: OverlayEvent): ReduceResult {
  if (state.mode === "pick") return handlePickerEvent(state, event);

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
  if (ch.length === 1 && ch >= " " && ch < "\x7f" && !event.event.ctrl) {
    return { overlay: packed(withFilter(state, state.filter + ch)), effects: [] };
  }
  return { overlay: packed(state), effects: [] };
}
