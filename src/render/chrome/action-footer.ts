import type { Command, CommandRegistry } from "../../actions/command.ts";
import type { AppContext } from "../../app/context.ts";
import type { Scope } from "../../keymap/engine.ts";
import type { Box } from "../box.ts";
import type { ResolvedDisplay } from "../capability.ts";
import { type Segment, StatusBar } from "./status-bar.ts";

export type FooterEntry = {
  binding: string;
  label: string;
  order: number;
  disabled: boolean;
  group: "primary" | "utility";
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
      group: cmd.footer.group ?? "primary",
    });
  }
  out.sort((a, b) => a.order - b.order);
  return out;
}

export function splitFooterEntries(entries: FooterEntry[]): {
  primary: FooterEntry[];
  utility: FooterEntry[];
} {
  const primary: FooterEntry[] = [];
  const utility: FooterEntry[] = [];
  for (const e of entries) {
    if (e.group === "utility") utility.push(e);
    else primary.push(e);
  }
  return { primary, utility };
}

export function entriesToSegments(entries: FooterEntry[]): Segment[] {
  const segs: Segment[] = [];
  entries.forEach((entry, i) => {
    if (i > 0) segs.push({ text: " ┊", tone: "dim" });
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

export type ActionFooterProps =
  | {
      display: ResolvedDisplay;
      app: AppContext;
      scope: Scope;
      /** Override — when set, renders this segment list instead of derived hints. */
      hint?: Segment[];
      /** Terminal width — when the combined primary + utility clusters would
       *  overflow, we collapse utility into the left cluster instead of letting
       *  OpenTUI overlap them. */
      width?: number;
    }
  | {
      display: ResolvedDisplay;
      app?: undefined;
      scope?: undefined;
      hint: Segment[];
      width?: number;
    };

/**
 * Bottom chrome strip. Reads `Command.footer` markers from the active registry
 * filtered by scope. Disabled commands stay visible but render dimmed so the
 * user still learns the key. When `hint` is passed, it replaces the derived
 * entries (used by overlays + flash messages).
 *
 * Registry-less mode: when `app`/`scope` are omitted, `hint` is required and
 * the row renders verbatim. Used by screens that mount before AppContext is
 * wired (ADR 0008).
 */
function segmentsLength(segs: Segment[]): number {
  let n = 0;
  for (const s of segs) n += s.text.length;
  return n;
}

export function ActionFooter(props: ActionFooterProps): ReturnType<typeof Box> {
  const { display, hint, width } = props;
  if (hint) {
    return StatusBar({ display, left: [{ text: " " }, ...hint], width });
  }
  const app = props.app;
  const scope = props.scope;
  const registry = app?.commandRegistry;
  if (!registry || !app || !scope) {
    return StatusBar({ display, left: [{ text: " " }], width });
  }
  const entries = collectFooterEntries(registry, scope, app);
  const { primary, utility } = splitFooterEntries(entries);
  const primarySegs = entriesToSegments(primary);
  const utilitySegs = entriesToSegments(utility);
  // If the combined clusters would overlap (flexbox space-between has no
  // collision detection), fall back to a single left cluster with `┊` between
  // groups. Otherwise route primary→left, utility→right.
  // Chrome wraps the footer in a row with padding=1 each side, and each cluster
  // adds its own 1-col pad. Plus we need at least 1 col of breathing room
  // between clusters for space-between to read as separation, not overlap.
  // Total overhead = 5 cols (2 chrome pad + 2 cluster pad + 1 gap).
  const leftWidth = segmentsLength(primarySegs);
  const rightWidth = segmentsLength(utilitySegs);
  const overflows = width !== undefined && leftWidth + rightWidth + 5 > width;
  if (utility.length === 0 || overflows) {
    const middle =
      primary.length > 0 && utility.length > 0 ? [{ text: " ┊", tone: "dim" as const }] : [];
    return StatusBar({
      display,
      left: [{ text: " " }, ...primarySegs, ...middle, ...utilitySegs],
      width,
    });
  }
  return StatusBar({
    display,
    left: [{ text: " " }, ...primarySegs],
    right: [...utilitySegs, { text: " " }],
    width,
  });
}
