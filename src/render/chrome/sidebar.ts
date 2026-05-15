import type { SidebarData, SidebarSignalRow } from "../../app/sidebar-data.ts";
import { Box } from "../box.ts";
import type { ResolvedDisplay } from "../capability.ts";
import { issueGlyph } from "../glyph-map.ts";
import { progressSegments } from "../progress-segments.ts";
import { Text, TextAttributes } from "../text.ts";
import { truncateMiddle } from "../truncate.ts";
import { type Segment, segmentsToStyledText } from "./status-bar.ts";
import { Wordmark } from "./wordmark.ts";

/**
 * Approximate visual cell width. Many of the glyphs we use in the sidebar
 * (`⚠`, `⚡`, `●`, `◇`) live in Unicode blocks that East-Asian-Width-Ambiguous
 * tables call 2 cells in CJK locales and 1 elsewhere — but most terminals on
 * macOS / Linux render them as 2 regardless. We assume 2 for symbols in the
 * Misc-Symbols/Dingbats range so layout math reserves enough room.
 */
function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    // Latin / common BMP: 1 cell.
    if (code < 0x2000) {
      w += 1;
      continue;
    }
    // Misc Symbols (U+2600..U+26FF), Dingbats (U+2700..U+27BF), and the
    // CJK Symbols block all default to 2 cells on the terminals we ship to.
    if (code >= 0x2300 && code <= 0x27ff) w += 2;
    else if (code >= 0x2e80 && code <= 0x9fff) w += 2;
    else w += 1;
  }
  return w;
}

const PROGRESS_BAR_WIDTH = 10;

/**
 * Sidebar — the right column shown at ≥120 cols when `display.sidebar` resolves
 * to visible. Replaces the top status bar. Content per plan A4 (queue mode)
 * or E1 (stats mode).
 *
 * Width is the column width in characters (24 or 32 — see `sidebarWidth`).
 * `innerWidth` = width - 2 for left/right padding.
 */
export function Sidebar(props: {
  display: ResolvedDisplay;
  data: SidebarData;
  width: number;
}): ReturnType<typeof Box> {
  const { display, data, width } = props;
  // Floor of 22 mirrors the 24-col `sidebarWidth` contract minus left/right
  // padding. Counter rows and truncate-middle assume the inner column has
  // room for an 8-char label + count + gap.
  const innerWidth = Math.max(22, width - 2);

  const children: ReturnType<typeof Box | typeof Text>[] = [
    Wordmark({ display, innerWidth }),
    Text({ content: "" }),
  ];

  if (data.mode === "queue") {
    children.push(...renderQueueBody(display, data, innerWidth));
  } else {
    children.push(...renderStatsBody(display, data, innerWidth));
  }

  return Box(
    {
      flexDirection: "column",
      width,
      flexShrink: 0,
      paddingLeft: 1,
      paddingRight: 1,
    },
    ...children,
  );
}

function renderQueueBody(
  display: ResolvedDisplay,
  data: Extract<SidebarData, { mode: "queue" }>,
  innerWidth: number,
): ReturnType<typeof Box | typeof Text>[] {
  const out: ReturnType<typeof Box | typeof Text>[] = [];

  // Queue title row
  out.push(
    fixedRow(
      innerWidth,
      Text({
        content: segmentsToStyledText(
          [{ text: truncateEndSafe(data.queueLabel, innerWidth), tone: "default" }],
          display,
        ),
        attributes: TextAttributes.BOLD,
        wrapMode: "char",
      }),
    ),
  );
  out.push(
    fixedRow(
      innerWidth,
      Text({
        content: segmentsToStyledText(
          [{ text: `${data.queuePosition} / ${data.queueTotal}`, tone: "muted" }],
          display,
        ),
        wrapMode: "char",
      }),
    ),
  );
  out.push(blankRow());

  // Dataset path
  out.push(
    fixedRow(
      innerWidth,
      Text({
        content: segmentsToStyledText(
          [{ text: truncateMiddle(data.datasetPath, innerWidth), tone: "muted" }],
          display,
        ),
        wrapMode: "char",
      }),
    ),
  );
  out.push(blankRow());

  // Smart-next mode row (when active)
  if (data.smartNext) {
    out.push(
      fixedRow(
        innerWidth,
        Text({
          content: segmentsToStyledText(
            [
              { text: "▸ ", tone: "accent" },
              { text: "smart", tone: "accent" },
            ],
            display,
          ),
          wrapMode: "char",
        }),
      ),
    );
    out.push(blankRow());
  }

  // Counters section
  out.push(sectionHeader(display, "Counters", innerWidth));
  out.push(blankRow());
  out.push(counterRow(display, "reviewed", data.counters.reviewed, innerWidth));
  out.push(counterRow(display, "skipped", data.counters.skipped, innerWidth));
  out.push(counterRow(display, "marked", data.counters.marked, innerWidth));
  out.push(blankRow());
  out.push(progressRow(display, data.queueProgress.reviewed, data.queueProgress.total, innerWidth));
  out.push(blankRow());

  // Signals section
  out.push(sectionHeader(display, "Signals", innerWidth));
  out.push(blankRow());
  if (data.signals.length === 0) {
    out.push(
      fixedRow(
        innerWidth,
        Text({
          content: segmentsToStyledText([{ text: "None", tone: "dim" }], display),
          attributes: TextAttributes.DIM,
          wrapMode: "char",
        }),
      ),
    );
  } else {
    for (const signal of data.signals) {
      out.push(signalRow(display, signal, innerWidth));
    }
  }

  return out;
}

function renderStatsBody(
  display: ResolvedDisplay,
  data: Extract<SidebarData, { mode: "stats" }>,
  innerWidth: number,
): ReturnType<typeof Box | typeof Text>[] {
  return [
    fixedRow(
      innerWidth,
      Text({
        content: segmentsToStyledText(
          [{ text: truncateMiddle(data.datasetPath, innerWidth), tone: "muted" }],
          display,
        ),
        wrapMode: "char",
      }),
    ),
    blankRow(),
    sectionHeader(display, "Totals", innerWidth),
    blankRow(),
    counterRow(display, "total", data.totals.total, innerWidth),
    counterRow(display, "reviewed", data.totals.reviewed, innerWidth),
    counterRow(display, "pending", data.totals.pending, innerWidth),
    counterRow(display, "accepted", data.totals.accepted, innerWidth),
    counterRow(display, "relabeled", data.totals.relabeled, innerWidth),
    counterRow(display, "rejected", data.totals.rejected, innerWidth),
    counterRow(display, "skipped", data.totals.skipped, innerWidth),
  ];
}

function sectionHeader(
  display: ResolvedDisplay,
  label: string,
  innerWidth: number,
): ReturnType<typeof Box> {
  const labelWithSpace = `${label} `;
  const ruleLen = Math.max(1, innerWidth - labelWithSpace.length);
  return fixedRow(
    innerWidth,
    Text({
      content: segmentsToStyledText(
        [
          { text: labelWithSpace, tone: "muted" },
          { text: "─".repeat(ruleLen), tone: "dim" },
        ],
        display,
      ),
      wrapMode: "char",
    }),
  );
}

function counterRow(
  display: ResolvedDisplay,
  label: string,
  count: number,
  innerWidth: number,
): ReturnType<typeof Box> {
  const countText = String(count);
  const gap = Math.max(2, innerWidth - visualWidth(label) - visualWidth(countText));
  return fixedRow(
    innerWidth,
    Text({
      content: segmentsToStyledText(
        [
          { text: label, tone: "default" },
          { text: " ".repeat(gap), tone: "default" },
          { text: countText, tone: "default" },
        ],
        display,
      ),
      wrapMode: "char",
    }),
  );
}

function progressRow(
  display: ResolvedDisplay,
  reviewed: number,
  total: number,
  innerWidth: number,
): ReturnType<typeof Box> {
  // Shrink the bar width so `[bar] NNN%` always fits in innerWidth at narrow
  // sidebar widths (24ch). Reserve 6 cells for ` 100%` + brackets.
  const reservedForPct = 6;
  const barWidth = Math.max(4, Math.min(PROGRESS_BAR_WIDTH, innerWidth - reservedForPct));
  const segs = progressSegments(reviewed, total, barWidth, display);
  return fixedRow(
    innerWidth,
    Text({
      content: segmentsToStyledText(segs, display),
      wrapMode: "char",
    }),
  );
}

function signalRow(
  display: ResolvedDisplay,
  signal: SidebarSignalRow,
  innerWidth: number,
): ReturnType<typeof Box> {
  const glyph = issueGlyph(signal.type, display);
  const glyphCells = visualWidth(glyph);
  const countText = String(signal.count);
  const countCells = visualWidth(countText);
  // Reserve glyph + 1ch + label + ≥1ch gap + count.
  const labelBudget = Math.max(4, innerWidth - glyphCells - 1 - countCells - 1);
  const labelText = truncateEndSafe(signal.type, labelBudget);
  const used = glyphCells + 1 + visualWidth(labelText) + countCells;
  const gap = Math.max(1, innerWidth - used);
  return fixedRow(
    innerWidth,
    Text({
      content: segmentsToStyledText(
        [
          { text: glyph, tone: "warning" },
          { text: " ", tone: "default" },
          { text: labelText, tone: "default" },
          { text: " ".repeat(gap), tone: "default" },
          { text: countText, tone: "muted" },
        ],
        display,
      ),
      wrapMode: "char",
    }),
  );
}

/**
 * Wrap a Text in a Box with explicit width + overflow:hidden so OpenTUI never
 * line-wraps the row even if visual-width math is off by a cell. Sidebar
 * column is fixed width — overflow disappears off the right edge rather than
 * pushing onto a second visual row.
 */
function fixedRow(innerWidth: number, child: ReturnType<typeof Text>): ReturnType<typeof Box> {
  return Box(
    {
      flexDirection: "row",
      width: innerWidth,
      flexShrink: 0,
      overflow: "hidden",
    },
    child,
  );
}

function blankRow(): ReturnType<typeof Text> {
  return Text({ content: "" });
}

/**
 * Truncate-at-end that never returns less than 4 chars. Used for sidebar
 * values where the prefix is identity (queue id, signal type label, etc.).
 */
function truncateEndSafe(s: string, max: number): string {
  const m = Math.max(4, max);
  if (s.length <= m) return s;
  return `${s.slice(0, m - 1)}…`;
}

/**
 * Truncate-middle that never returns less than 4 chars. The 4-char floor is
 * the smallest output `truncateMiddle` produces meaningfully (`a…z` style:
 * one head char + ellipsis + one tail char + room to grow). Below 4 the
 * helper would either throw or collapse to just `…`, which reads worse than
 * a clipped string. Callers pass narrow budgets when the parent column is
 * tiny — preserve at least the head/tail anchor.
 */
function truncateMiddleSafe(s: string, max: number): string {
  return truncateMiddle(s, Math.max(4, max));
}

/** Re-export for callers — provides one Segment per fold result. */
export function pathSegments(path: string): Segment[] {
  return [{ text: path, tone: "muted" }];
}
