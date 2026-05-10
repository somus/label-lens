import type { Command } from "../actions/command.ts";
import type { Scope } from "../keymap/engine.ts";
import type { Overlay, OverlayEvent, ReduceResult } from "./types.ts";

export type HelpEntry = {
  category: string;
  binding: string;
  palette?: string;
  name: string;
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
  entries.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    const aBound = a.binding === "—" ? 1 : 0;
    const bBound = b.binding === "—" ? 1 : 0;
    if (aBound !== bBound) return aBound - bBound;
    return a.name.localeCompare(b.name);
  });
  return { scope: args.scope, entries, scroll: 0 };
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
    return {
      overlay: packed({
        ...state,
        scroll: Math.min(state.scroll + 1, Math.max(state.entries.length - 1, 0)),
      }),
      effects: [],
    };
  }
  if (name === "up") {
    return { overlay: packed({ ...state, scroll: Math.max(state.scroll - 1, 0) }), effects: [] };
  }
  return { overlay: packed(state), effects: [] };
}
