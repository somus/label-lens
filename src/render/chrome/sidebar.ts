import type { SidebarData, SidebarSignalRow } from "../../app/sidebar-data.ts";
import { Box } from "../box.ts";
import type { ResolvedDisplay } from "../capability.ts";
import { issueGlyph } from "../glyph-map.ts";
import { progressSegments } from "../progress-segments.ts";
import { Text, TextAttributes } from "../text.ts";
import { truncateMiddle } from "../truncate.ts";
import { type Segment, segmentsToStyledText } from "./status-bar.ts";
import { Wordmark } from "./wordmark.ts";

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
    Text({
      content: segmentsToStyledText(
        [{ text: truncateMiddleSafe(data.queueLabel, innerWidth), tone: "default" }],
        display,
      ),
      attributes: TextAttributes.BOLD,
    }),
  );
  out.push(
    Text({
      content: segmentsToStyledText(
        [
          {
            text: `${data.queuePosition} / ${data.queueTotal}`,
            tone: "muted",
          },
        ],
        display,
      ),
    }),
  );
  out.push(Text({ content: "" }));

  // Dataset path
  out.push(
    Text({
      content: segmentsToStyledText(
        [{ text: truncateMiddle(data.datasetPath, innerWidth), tone: "muted" }],
        display,
      ),
    }),
  );
  out.push(Text({ content: "" }));

  // Smart-next mode row (when active)
  if (data.smartNext) {
    out.push(
      Text({
        content: segmentsToStyledText(
          [
            { text: "▸ ", tone: "accent" },
            { text: "smart", tone: "accent" },
          ],
          display,
        ),
      }),
    );
    out.push(Text({ content: "" }));
  }

  // Counters section
  out.push(sectionHeader(display, "Counters", innerWidth));
  out.push(counterRow(display, "reviewed", data.counters.reviewed, innerWidth));
  out.push(counterRow(display, "skipped", data.counters.skipped, innerWidth));
  out.push(counterRow(display, "marked", data.counters.marked, innerWidth));
  out.push(progressRow(display, data.queueProgress.reviewed, data.queueProgress.total));
  out.push(Text({ content: "" }));

  // Signals section
  out.push(sectionHeader(display, "Signals", innerWidth));
  if (data.signals.length === 0) {
    out.push(
      Text({
        content: segmentsToStyledText([{ text: "None", tone: "dim" }], display),
        attributes: TextAttributes.DIM,
      }),
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
  const out: ReturnType<typeof Box | typeof Text>[] = [
    Text({
      content: segmentsToStyledText(
        [{ text: truncateMiddle(data.datasetPath, innerWidth), tone: "muted" }],
        display,
      ),
    }),
    Text({ content: "" }),
    sectionHeader(display, "Totals", innerWidth),
    counterRow(display, "total", data.totals.total, innerWidth),
    counterRow(display, "reviewed", data.totals.reviewed, innerWidth),
    counterRow(display, "pending", data.totals.pending, innerWidth),
    counterRow(display, "accepted", data.totals.accepted, innerWidth),
    counterRow(display, "relabeled", data.totals.relabeled, innerWidth),
    counterRow(display, "rejected", data.totals.rejected, innerWidth),
    counterRow(display, "skipped", data.totals.skipped, innerWidth),
  ];
  return out;
}

function sectionHeader(
  display: ResolvedDisplay,
  label: string,
  innerWidth: number,
): ReturnType<typeof Text> {
  const labelWithSpace = `${label} `;
  const ruleLen = Math.max(1, innerWidth - labelWithSpace.length);
  return Text({
    content: segmentsToStyledText(
      [
        { text: labelWithSpace, tone: "muted" },
        { text: "─".repeat(ruleLen), tone: "dim" },
      ],
      display,
    ),
  });
}

function counterRow(
  display: ResolvedDisplay,
  label: string,
  count: number,
  innerWidth: number,
): ReturnType<typeof Text> {
  const countText = String(count);
  const gap = Math.max(2, innerWidth - label.length - countText.length);
  return Text({
    content: segmentsToStyledText(
      [
        { text: label, tone: "default" },
        { text: " ".repeat(gap), tone: "default" },
        { text: countText, tone: "default" },
      ],
      display,
    ),
  });
}

function progressRow(
  display: ResolvedDisplay,
  reviewed: number,
  total: number,
): ReturnType<typeof Text> {
  const segs = progressSegments(reviewed, total, PROGRESS_BAR_WIDTH, display);
  return Text({ content: segmentsToStyledText(segs, display) });
}

function signalRow(
  display: ResolvedDisplay,
  signal: SidebarSignalRow,
  innerWidth: number,
): ReturnType<typeof Text> {
  const glyph = issueGlyph(signal.type, display);
  const glyphWidth = glyph.length;
  const countText = String(signal.count);
  // Reserve glyph + space + count for the label budget. `truncateMiddleSafe`
  // floor protects against pathological narrow widths.
  const labelBudget = innerWidth - glyphWidth - 1 - countText.length - 1;
  const labelText = truncateMiddleSafe(signal.type, labelBudget);
  const gap = Math.max(1, innerWidth - glyphWidth - 1 - labelText.length - countText.length);
  return Text({
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
  });
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
