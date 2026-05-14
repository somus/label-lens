import type { Command, CommandRegistry } from "../../actions/command.ts";
import type { AppContext } from "../../app/context.ts";
import type { Scope } from "../../keymap/engine.ts";
import type { Box } from "../box.ts";
import type { ResolvedDisplay } from "../capability.ts";
import { type Segment, StatusBar } from "./status-bar.ts";

type FooterEntry = {
  binding: string;
  label: string;
  order: number;
  disabled: boolean;
};

function firstBinding(cmd: Command): string | null {
  if (!cmd.binding) return null;
  return Array.isArray(cmd.binding) ? (cmd.binding[0] ?? null) : cmd.binding;
}

function displayKey(binding: string): string {
  // "g d" → "gd" (chord), "shift+q" → "Q", "ctrl+d" → "^d".
  if (binding.includes(" ") && !binding.includes("+")) {
    const keys = binding.split(" ");
    if (keys.length > 2) {
      throw new Error(`displayKey: footer chord exceeds 2 keys: "${binding}"`);
    }
    return keys.join("");
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
    // Disabled commands stay visible (rendered dimmed with an `(unavailable)`
    // suffix by entriesToSegments) so the binding stays discoverable. ADR 0008.
    const enabled = cmd.enabled ? cmd.enabled(ctx) : true;
    out.push({
      binding: displayKey(binding),
      label: cmd.footer.label,
      order: cmd.footer.order ?? 1000,
      disabled: !enabled,
    });
  }
  out.sort((a, b) => a.order - b.order);
  return out;
}

export function entriesToSegments(entries: FooterEntry[]): Segment[] {
  const segs: Segment[] = [];
  entries.forEach((entry, i) => {
    if (i > 0) segs.push({ text: "  ", tone: "dim" });
    if (entry.disabled) {
      // Tone-only signal so the footer stays within its single-row budget
      // (ADR 0008). Dim renders distinctly from accent (truecolor/256) or via
      // attribute on 16/mono (dim vs bold). disabledMessage explains *why* on
      // attempt; the footer just signals availability.
      segs.push({ text: `[${entry.binding}] `, tone: "dim" });
      segs.push({ text: entry.label, tone: "dim" });
    } else {
      segs.push({ text: `[${entry.binding}] `, tone: "accent" });
      segs.push({ text: entry.label, tone: "muted" });
    }
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
