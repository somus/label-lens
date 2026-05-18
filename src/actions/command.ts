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
  /** Cluster for the footer chrome. `primary` → left, `utility` → right. Default `primary`. */
  group?: "primary" | "utility";
};

export type PaletteCategory = "queues" | "filters" | "actions" | "help";

export type PaletteMetadata = {
  category?: PaletteCategory;
  description?: string;
  arity?: 0 | 1;
  pickerKind?:
    | "source"
    | "label"
    | "reason"
    | "issue"
    | "correction"
    | "topic"
    | "format"
    | "queue";
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

/**
 * Replace a command's `binding` with the per-command override pulled from
 * `config.keys`. Commands not mentioned in `overrides` pass through untouched;
 * `reserved` is the post-override-aware reserved set (every built-in binding
 * + label keys minus the keys currently bound to the commands being
 * overridden), so an override key collides only with keys still in use after
 * the swap. Errors are aggregated so the reviewer fixes them in one pass.
 */
export function applyKeyOverrides(
  commands: Command[],
  overrides: Record<string, string> | undefined,
  reserved: Set<string>,
): { commands: Command[]; errors: string[] } {
  if (!overrides || Object.keys(overrides).length === 0) {
    return { commands, errors: [] };
  }
  const byName = new Map(commands.map((cmd) => [cmd.name, cmd] as const));
  const errors: string[] = [];
  const claimed = new Map<string, string>();
  for (const [name, key] of Object.entries(overrides)) {
    if (!byName.has(name)) {
      errors.push(`keys.${name}: no command with that name exists`);
      continue;
    }
    if (key.length === 0) {
      errors.push(`keys.${name}: override key must not be empty`);
      continue;
    }
    if (reserved.has(key)) {
      errors.push(`keys.${name}: '${key}' is reserved by a built-in command or chord starter`);
    }
    const prior = claimed.get(key);
    if (prior !== undefined) {
      errors.push(`keys.${name}: '${key}' is also assigned to ${prior}`);
    }
    claimed.set(key, name);
  }
  if (errors.length > 0) return { commands, errors };
  const out = commands.map((cmd) => {
    const override = overrides[cmd.name];
    return override === undefined ? cmd : { ...cmd, binding: override };
  });
  return { commands: out, errors: [] };
}

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
