import { bg as bgFn, bold as boldFn, fg as fgFn, StyledText } from "@opentui/core";
import type { Command, CommandRegistry } from "../../actions/command.ts";
import type { AppContext } from "../../app/context.ts";
import type { Scope } from "../../keymap/engine.ts";
import type { FeedbackTone } from "../anim.ts";
import { Box } from "../box.ts";
import type { ResolvedDisplay } from "../capability.ts";
import { Text } from "../text.ts";
import { resolveTheme } from "../theme.ts";
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

function footerMotionKey(entry: FooterEntry): string {
  if (entry.label === "accept") return "footer.accept";
  if (entry.label === "reject") return "footer.reject";
  if (entry.label === "relabel") return "footer.relabel";
  return `footer.${entry.label}`;
}

function feedbackTone(tone: FeedbackTone | Segment["tone"] | null): Segment["tone"] {
  if (tone === "success" || tone === "danger" || tone === "info" || tone === "accent") {
    return tone;
  }
  return "accent";
}

export function entriesToSegments(entries: FooterEntry[], app?: AppContext): Segment[] {
  const segs: Segment[] = [];
  entries.forEach((entry, i) => {
    const motion = app?.motion.snapshot(footerMotionKey(entry));
    const activeTone = motion?.active ? feedbackTone(motion.tone) : null;
    if (i > 0) segs.push({ text: " ┊", tone: "dim" });
    if (entry.disabled) {
      // Tone-only signal so the footer stays within its single-row budget
      // (ADR 0008). Dim renders distinctly from accent (truecolor/256) or via
      // attribute on 16/mono (dim vs bold). disabledMessage explains *why* on
      // attempt; the footer just signals availability.
      segs.push({ text: `[${entry.binding}] `, tone: "dim" });
      segs.push({ text: entry.label, tone: "dim" });
    } else {
      segs.push({ text: `[${entry.binding}] `, tone: activeTone ?? "accent" });
      segs.push({ text: entry.label, tone: activeTone ?? "muted" });
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
      /** When a flash is the active hint, paint the entire footer row in the
       *  flash kind's solid tone background (CRUSH-style toast). Plan D2/D5. */
      flashKind?: "success" | "info" | "warning" | "error";
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
      flashKind?: "success" | "info" | "warning" | "error";
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
/**
 * Minimum overhead the footer needs beyond raw cluster text:
 *   2 cols — Chrome outer padding (left + right)
 *   2 cols — cluster's own leading/trailing space
 *   1 col  — breathing room so space-between reads as separation, not overlap
 */
const FOOTER_OVERFLOW_OVERHEAD = 5;

function segmentsLength(segs: Segment[]): number {
  let n = 0;
  for (const s of segs) n += s.text.length;
  return n;
}

const TOAST_LABEL: Record<"success" | "info" | "warning" | "error", string> = {
  success: "OK",
  info: "INFO",
  warning: "WARN",
  error: "FAIL",
};

// Hand-picked hex pairs per kind. Chip = darker, message = our normal
// `fg.<kind>` tone. Hardcoded (not derived) so we can hit specific
// values without the dark/light palette branching.
const TOAST_PALETTE: Record<
  "success" | "info" | "warning" | "error",
  { chip: string; message: string }
> = {
  success: { chip: "#3d9c5a", message: "#7fd793" },
  info: { chip: "#5078c8", message: "#8ab4ff" },
  warning: { chip: "#b8893d", message: "#e0b46a" },
  error: { chip: "#b85a5a", message: "#e07b7b" },
};

/**
 * CRUSH-style two-tone toast (plan D2/D5). Layout:
 *
 *   [ LABEL ][ message …………………………………………… ]
 *
 * - LABEL chip: saturated `fg.<kind>` bg + page-bg fg + bold.
 * - Message bg: same tone blended ~55% toward page bg so the label chip
 *   reads as the louder anchor; message bg stays tinted but softer.
 * - Both halves share the same fg (page-bg color) so text contrasts under
 *   either theme without per-theme tuning.
 *
 * Mono/16 callers hit the StatusBar path higher up — this function only
 * runs at truecolor / 256-color.
 */
function toastRow(
  display: ResolvedDisplay,
  hint: Segment[],
  flashKind: "success" | "info" | "warning" | "error",
  _width: number | undefined,
): ReturnType<typeof Box> {
  const t = resolveTheme(display);
  const pageBg = t.bg.chrome !== "transparent" ? t.bg.chrome : "#0d1117";
  const { chip: chipBg, message: messageBg } = TOAST_PALETTE[flashKind];
  const fgColor = pageBg;
  const labelText = ` ${TOAST_LABEL[flashKind]} `;
  // Drop the segment-bundled leading glyph from `flashFooterHint` — the
  // chip already conveys kind. Take the LAST hint segment (the bare
  // message text) and prepend a single space for breathing room.
  const messageText = ` ${hint[hint.length - 1]?.text.trim() ?? ""}`;
  // `height: 1` keeps the toast bounded to a single row. Without it the
  // wrapping Box (inside Chrome's column-flex) would grow vertically and
  // swallow the body area.
  return Box(
    {
      flexDirection: "row",
      height: 1,
      shouldFill: true,
      backgroundColor: messageBg,
    },
    Box(
      {
        flexDirection: "row",
        flexShrink: 0,
        height: 1,
        shouldFill: true,
        backgroundColor: chipBg,
      },
      Text({
        content: new StyledText([bgFn(chipBg)(boldFn(fgFn(fgColor)(labelText)))]),
      }),
    ),
    Text({
      content: new StyledText([bgFn(messageBg)(boldFn(fgFn(fgColor)(messageText)))]),
    }),
  );
}

export function ActionFooter(props: ActionFooterProps): ReturnType<typeof Box> {
  const { display, hint, width, flashKind } = props;
  if (hint && flashKind) {
    // Solid-bg toast (CRUSH-style, plan D2/D5). At mono/16 fall back to
    // the plain hint row — bg fills are unreliable there.
    const rich = display.color === "truecolor" || display.color === "256";
    if (!rich) {
      return StatusBar({ display, left: [{ text: " " }, ...hint], width });
    }
    return toastRow(display, hint, flashKind, width);
  }
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
  const primarySegs = entriesToSegments(primary, app);
  const utilitySegs = entriesToSegments(utility, app);
  // If the combined clusters would overlap (flexbox space-between has no
  // collision detection), collapse into a single left cluster with `┊` between
  // groups. Otherwise route primary→left, utility→right.
  const leftWidth = segmentsLength(primarySegs);
  const rightWidth = segmentsLength(utilitySegs);
  const overflows =
    width !== undefined && leftWidth + rightWidth + FOOTER_OVERFLOW_OVERHEAD > width;
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
