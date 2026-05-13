import type { Command, CommandRegistry } from "../../actions/command.ts";
import type { AppContext } from "../../app/context.ts";
import type { Scope } from "../../keymap/engine.ts";
import type { Box } from "../box.ts";
import type { ResolvedDisplay } from "../capability.ts";
import { type Segment, StatusBar } from "./status-bar.ts";

type FooterEntry = {
  binding: string;
  label: string;
  enabled: boolean;
  order: number;
};

function firstBinding(cmd: Command): string | null {
  if (!cmd.binding) return null;
  return Array.isArray(cmd.binding) ? (cmd.binding[0] ?? null) : cmd.binding;
}

function displayKey(binding: string): string {
  // "g d" → "gd" (chord), "shift+q" → "Q", "ctrl+d" → "^d".
  if (binding.includes(" ") && !binding.includes("+")) {
    return binding.split(" ").join("");
  }
  const lower = binding.toLowerCase();
  const parts = lower.split("+");
  const key = parts[parts.length - 1] ?? "";
  if (parts.includes("ctrl")) return `^${key}`;
  if (parts.includes("shift")) return key.toUpperCase();
  if (parts.includes("meta")) return `M-${key}`;
  return key;
}

export function collectFooterEntries(
  registry: CommandRegistry,
  scope: Scope,
  ctx: AppContext,
): FooterEntry[] {
  const out: FooterEntry[] = [];
  for (const cmd of registry.values()) {
    if (!cmd.footer) continue;
    const inScope =
      cmd.footer.scopes !== undefined
        ? cmd.footer.scopes.includes(scope)
        : cmd.scope === scope || cmd.scope === "global";
    if (!inScope) continue;
    const binding = firstBinding(cmd);
    if (!binding) continue;
    // Drop disabled commands entirely — keeps the footer relevant. Commands
    // whose run handler does a runtime check (e.g. accept-with-no-prediction)
    // should leave `enabled` permissive so the binding stays advertised.
    const enabled = cmd.enabled ? cmd.enabled(ctx) : true;
    if (!enabled) continue;
    out.push({
      binding: displayKey(binding),
      label: cmd.footer.label,
      enabled,
      order: cmd.footer.order ?? 1000,
    });
  }
  out.sort((a, b) => a.order - b.order);
  return out;
}

export function entriesToSegments(entries: FooterEntry[]): Segment[] {
  const segs: Segment[] = [];
  entries.forEach((entry, i) => {
    if (i > 0) segs.push({ text: "  ", tone: "dim" });
    const keyTone = entry.enabled ? "accent" : "dim";
    segs.push({ text: `[${entry.binding}] `, tone: keyTone });
    segs.push({
      text: entry.label,
      tone: entry.enabled ? "muted" : "dim",
    });
  });
  return segs;
}

export type ActionFooterProps = {
  display: ResolvedDisplay;
  app: AppContext;
  scope: Scope;
  /** Override — when set, renders this segment list instead of derived hints. */
  hint?: Segment[];
};

/**
 * Bottom chrome strip. Reads `Command.footer` markers from the active registry
 * filtered by scope. Disabled commands stay visible but render dimmed so the
 * user still learns the key. When `hint` is passed, it replaces the derived
 * entries (used by overlays + flash messages).
 */
export function ActionFooter(props: ActionFooterProps): ReturnType<typeof Box> {
  const { display, app, scope, hint } = props;
  if (hint) {
    return StatusBar({ display, left: [{ text: " " }, ...hint] });
  }
  const registry = app.commandRegistry;
  if (!registry) {
    return StatusBar({ display, left: [{ text: " " }] });
  }
  const entries = collectFooterEntries(registry, scope, app);
  return StatusBar({
    display,
    left: [{ text: " " }, ...entriesToSegments(entries)],
  });
}
