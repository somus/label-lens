import type { Command } from "../actions/command.ts";
import type { Scope } from "../keymap/engine.ts";
import type { Overlay, OverlayEvent, ReduceResult } from "./types.ts";

export const HELP_PAGE = 30;

export type HelpEntry = {
  category: string;
  binding: string;
  palette?: string;
  name: string;
  order?: number;
};

export type HelpState = {
  scope: Scope;
  entries: HelpEntry[];
  scroll: number;
};

export type OpenHelpArgs = {
  commands: Command[];
  scope: Scope;
};

export function openHelp(args: OpenHelpArgs): HelpState {
  const entries: HelpEntry[] = [];
  for (const c of args.commands) {
    if (c.hidden) continue;
    if (c.scope !== args.scope && c.scope !== "global") continue;
    const bindings = Array.isArray(c.binding) ? c.binding : c.binding ? [c.binding] : [];
    const bindingDisplay = bindings.length === 0 ? "—" : bindings.join(", ");
    entries.push({
      category: c.name.split(".")[0] ?? "other",
      binding: bindingDisplay,
      palette: c.palette,
      name: c.name,
    });
  }
  entries.push(...overlayHelpEntries(args.scope));
  entries.sort((a, b) => {
    const rankDelta = helpEntryRank(a, args.scope) - helpEntryRank(b, args.scope);
    if (rankDelta !== 0) return rankDelta;
    const orderDelta = (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
    if (orderDelta !== 0) return orderDelta;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    const aBound = a.binding === "—" ? 1 : 0;
    const bBound = b.binding === "—" ? 1 : 0;
    if (aBound !== bBound) return aBound - bBound;
    return a.name.localeCompare(b.name);
  });
  return { scope: args.scope, entries, scroll: 0 };
}

function helpEntryRank(entry: HelpEntry, scope: Scope): number {
  if (entry.category === scope) return 0;
  return 1;
}

function overlayHelpEntries(scope: Scope): HelpEntry[] {
  if (scope !== "stats") return [];
  return [{ category: "stats", binding: "j/k enter esc", name: "stats.controls", order: 0 }];
}

function packed(state: HelpState): Overlay {
  return { kind: "help", state };
}

export function reduceHelp(state: HelpState, event: OverlayEvent): ReduceResult {
  if (event.kind === "cancel") return { overlay: null, effects: [{ kind: "close" }] };
  if (event.kind === "commit") return { overlay: null, effects: [{ kind: "close" }] };
  if (event.kind !== "key") return { overlay: packed(state), effects: [] };
  const name = event.event.name;
  if (name === "escape" || name === "?" || name === "return") {
    return { overlay: null, effects: [{ kind: "close" }] };
  }
  if (name === "down") {
    const max = Math.max(state.entries.length - HELP_PAGE, 0);
    return {
      overlay: packed({ ...state, scroll: Math.min(state.scroll + 1, max) }),
      effects: [],
    };
  }
  if (name === "pagedown") {
    const max = Math.max(state.entries.length - HELP_PAGE, 0);
    return {
      overlay: packed({ ...state, scroll: Math.min(state.scroll + HELP_PAGE, max) }),
      effects: [],
    };
  }
  if (name === "pageup") {
    return {
      overlay: packed({ ...state, scroll: Math.max(state.scroll - HELP_PAGE, 0) }),
      effects: [],
    };
  }
  if (name === "up") {
    return { overlay: packed({ ...state, scroll: Math.max(state.scroll - 1, 0) }), effects: [] };
  }
  return { overlay: packed(state), effects: [], propagated: true };
}
