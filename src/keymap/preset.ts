import type { Command, CommandBindings } from "../actions/command.ts";
import type { Scope } from "./engine.ts";

export type BindingValue = string | string[];

export type PresetMap = Record<string, BindingValue>;

export type KeysConfig = {
  preset?: string;
  overrides?: PresetMap;
  presets?: Record<string, PresetMap>;
};

export type PresetName = "vim" | "simple";

const BUILTIN_PRESETS: readonly PresetName[] = ["vim", "simple"];

export function isBuiltinPreset(name: string): name is PresetName {
  return (BUILTIN_PRESETS as readonly string[]).includes(name);
}

function bindingForBuiltinPreset(
  bindings: CommandBindings | undefined,
  preset: PresetName,
): BindingValue | undefined {
  if (!bindings) return undefined;
  if (preset === "simple") return bindings.simple ?? bindings.vim;
  return bindings.vim;
}

/**
 * Validate a single binding string ("a", "ctrl+x", "g d"). Empty tokens, empty
 * chord parts, or unknown modifier syntax are rejected. The string is opaque
 * to the keymap engine otherwise — name part is anything non-empty.
 */
export function parseBinding(raw: string): { ok: true } | { ok: false; reason: string } {
  if (raw.length === 0) return { ok: false, reason: "binding string is empty" };
  const tokens = raw.split(" ").filter((t) => t.length > 0);
  if (tokens.length === 0) return { ok: false, reason: "binding string is empty" };
  if (tokens.length > 2) return { ok: false, reason: `chord '${raw}' must be at most two keys` };
  for (const token of tokens) {
    const parts = token.toLowerCase().split("+");
    if (parts.some((p) => p.length === 0)) {
      return { ok: false, reason: `malformed modifier in '${raw}'` };
    }
    const name = parts[parts.length - 1];
    const mods = parts.slice(0, -1);
    if (name === undefined || name.length === 0) {
      return { ok: false, reason: `missing key name in '${raw}'` };
    }
    for (const mod of mods) {
      if (mod !== "ctrl" && mod !== "shift" && mod !== "meta") {
        return { ok: false, reason: `unknown modifier '${mod}' in '${raw}'` };
      }
    }
  }
  return { ok: true };
}

function toArray(value: BindingValue | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function validatePresetMap(label: string, map: PresetMap, knownCommands: Set<string>): string[] {
  const errors: string[] = [];
  for (const [name, value] of Object.entries(map)) {
    if (!knownCommands.has(name)) {
      errors.push(`${label}.${name}: no command with that name exists`);
      continue;
    }
    const items = toArray(value);
    if (items.length === 0) {
      errors.push(`${label}.${name}: binding must not be empty`);
      continue;
    }
    for (const item of items) {
      if (typeof item !== "string" || item.length === 0) {
        errors.push(`${label}.${name}: binding must not be empty`);
        continue;
      }
      const parsed = parseBinding(item);
      if (!parsed.ok) errors.push(`${label}.${name}: ${parsed.reason}`);
    }
  }
  return errors;
}

function detectCollisions(commands: Command[]): string[] {
  const errors: string[] = [];
  const byScope = new Map<Scope, Map<string, string>>();
  for (const cmd of commands) {
    const bindings = toArray(cmd.binding);
    for (const key of bindings) {
      const scope = cmd.scope;
      let claim = byScope.get(scope);
      if (!claim) {
        claim = new Map();
        byScope.set(scope, claim);
      }
      const prior = claim.get(key);
      if (prior !== undefined) {
        errors.push(
          `keybinding '${key}' is bound to both ${prior} and ${cmd.name} in scope '${scope}'`,
        );
      } else {
        claim.set(key, cmd.name);
      }
    }
  }
  return errors;
}

/**
 * Resolve per-command bindings against the project's `keys` config.
 *
 * Merge order: vim baseline → selected preset deltas → `keys.overrides`.
 * `keys.preset` defaults to `simple` when absent. Returns rewritten commands
 * with `binding` populated, or an aggregated error list — callers should bail
 * before building the registry when `errors.length > 0`.
 */
export function resolvePreset(
  commands: Command[],
  keys: KeysConfig | undefined,
): { commands: Command[]; errors: string[] } {
  const errors: string[] = [];
  const presetName = keys?.preset ?? "simple";
  const customPresets = keys?.presets ?? {};
  const overrides = keys?.overrides ?? {};

  const known = new Set(commands.map((c) => c.name));

  const presetIsBuiltin = isBuiltinPreset(presetName);
  const presetIsCustom = Object.hasOwn(customPresets, presetName);

  if (!presetIsBuiltin && !presetIsCustom) {
    const customNames = Object.keys(customPresets);
    const all = [...BUILTIN_PRESETS, ...customNames];
    errors.push(`keys.preset: unknown preset '${presetName}' (known: ${all.join(", ")})`);
  }

  for (const [name, map] of Object.entries(customPresets)) {
    errors.push(...validatePresetMap(`keys.presets.${name}`, map, known));
  }
  errors.push(...validatePresetMap("keys.overrides", overrides, known));

  if (errors.length > 0) return { commands, errors };

  const out = commands.map((cmd) => {
    const baseline = bindingForBuiltinPreset(cmd.bindings, "vim");
    let binding: BindingValue | undefined = baseline;

    if (presetIsBuiltin) {
      binding = bindingForBuiltinPreset(cmd.bindings, presetName as PresetName);
    } else if (presetIsCustom) {
      const presetEntry = customPresets[presetName]?.[cmd.name];
      if (presetEntry !== undefined) binding = presetEntry;
    }

    if (Object.hasOwn(overrides, cmd.name)) {
      binding = overrides[cmd.name];
    }

    return binding === undefined ? cmd : { ...cmd, binding };
  });

  errors.push(...detectCollisions(out));
  if (errors.length > 0) return { commands, errors };

  return { commands: out, errors: [] };
}
