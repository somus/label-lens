import type { AppContext } from "../app/context.ts";
import type { Scope } from "../keymap/engine.ts";

export type ActionContext = AppContext;

/**
 * When set, this command appears in the action footer (PRD §UX-overhaul Slice 1).
 * Footer entries are the user-facing surface of the keymap — discoverability is
 * the contract. `scopes` restricts a global command to specific screens; omit to
 * inherit the command's own `scope`.
 */
export type FooterSpec = {
  label: string;
  order?: number;
  scopes?: Scope[];
};

export type PaletteCategory = "queues" | "filters" | "actions" | "help";

export type PaletteMetadata = {
  category?: PaletteCategory;
  description?: string;
  arity?: 0 | 1;
  pickerKind?: "source" | "label" | "reason" | "issue" | "correction" | "topic" | "format";
};

export type Command<Ctx extends ActionContext = ActionContext> = {
  name: string;
  scope: Scope;
  binding?: string | string[];
  palette?: string;
  paletteMetadata?: PaletteMetadata;
  hidden?: boolean;
  footer?: FooterSpec;
  /** Message flashed when run is gated by `enabled === false`. */
  disabledMessage?: string | ((ctx: Ctx) => string);
  enabled?: (ctx: Ctx) => boolean;
  run: (ctx: Ctx, argument?: string) => void | Promise<void>;
};

export type CommandRegistry = Map<string, Command>;

export function buildRegistry(commands: Command[]): CommandRegistry {
  const registry: CommandRegistry = new Map();
  for (const cmd of commands) {
    if (registry.has(cmd.name)) {
      throw new Error(`duplicate command name: ${cmd.name}`);
    }
    registry.set(cmd.name, cmd);
  }
  return registry;
}

export function commandsForScope(registry: CommandRegistry, scope: Scope): Command[] {
  const out: Command[] = [];
  for (const cmd of registry.values()) {
    if (cmd.scope === scope || cmd.scope === "global") out.push(cmd);
  }
  return out;
}

export function bindingsFor(commands: Command[]): { key: string; action: string; scope: Scope }[] {
  const out: { key: string; action: string; scope: Scope }[] = [];
  for (const cmd of commands) {
    const keys = Array.isArray(cmd.binding) ? cmd.binding : cmd.binding ? [cmd.binding] : [];
    for (const key of keys) {
      out.push({ key, action: cmd.name, scope: cmd.scope });
    }
  }
  return out;
}
