import type { SidebarData, SidebarSignalRow } from "../../app/sidebar-data.ts";
import type { MotionController } from "../anim.ts";
import { Box } from "../box.ts";
import type { ResolvedDisplay } from "../capability.ts";
import { issueGlyph } from "../glyph-map.ts";
import { progressSegments } from "../progress-segments.ts";
import { Text, TextAttributes } from "../text.ts";
import { truncateMiddle } from "../truncate.ts";
import { type Segment, segmentsToStyledText } from "./status-bar.ts";
import { Wordmark } from "./wordmark.ts";

/**
 * Per-glyph visual width override. Symbols in U+2300..U+27FF are
 * East-Asian-Width Ambiguous — fonts disagree on whether they render as
 * 1 cell or 2. Empirical testing (iTerm2, macOS Terminal, Ghostty,
 * WezTerm) shows the glyphs split as below: warning/zap render 2 cells,
 * filled circles / diamonds / checks render 1. Range-based guessing
 * misaligns columns in the bad case.
 *
 * Source-of-truth for the glyphs that flow through here is
 * `src/render/glyph-map.ts` — `issueGlyph`, `statusGlyph`, `flashGlyph`,
 * `kindGlyph`. When adding a new glyph there, add it here too. Unmapped
 * symbol codepoints fall back to the range heuristic (2 cells,
 * conservative) and `signalRow` asserts loudly if it sees one.
 */
const GLYPH_WIDTH_OVERRIDES: Record<string, number> = {
  "⚠": 2,
  "⚡": 2,
  "●": 1,
  "◇": 1,
  "◆": 1,
  "✓": 1,
  "✗": 1,
  "↻": 1,
  "ⓘ": 1,
  "⧉": 1,
  "○": 1,
};

function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const override = GLYPH_WIDTH_OVERRIDES[ch];
    if (override !== undefined) {
      w += override;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x2000) {
      w += 1;
      continue;
    }
    if (code >= 0x2300 && code <= 0x27ff) w += 2;
    else if (code >= 0x2e80 && code <= 0x9fff) w += 2;
    else w += 1;
  }
  return w;
}

const PROGRESS_BAR_WIDTH = 10;

/**
 * Right-side breathing room for dataset-path rows. A full-innerWidth path
 * butts up against the sidebar edge and reads as "overflow" even when it
 * fits — 2 cells of trailing space restores the visual margin.
 */
const SIDEBAR_EDGE_BREATHING_ROOM = 2;

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
  /**
   * Motion controller used to drive counter-row flashes when the reviewer
   * commits a decision / skip / mark. Each counter row queries the snapshot
   * for `sidebar.counter.<label>` and renders accent-toned when the
   * snapshot is active (≈200ms after the action). Optional — tests + the
   * registry-less re-ingest screen don't have a motion controller.
   */
  motion?: MotionController;
  /**
   * Plan A12 — tween the progress bar between reviewed-count increments
   * rather than snapping. AppContext threads this through; tests and the
   * registry-less screen leave it unset and get the static (untweened) bar.
   */
  observeProgress?: (reviewed: number) => number;
}): ReturnType<typeof Box> {
  const { display, data, width, motion, observeProgress } = props;
  // Floor of 22 mirrors the 24-col `sidebarWidth` contract minus left/right
  // padding. Counter rows and truncate-middle assume the inner column has
  // room for an 8-char label + count + gap.
  const innerWidth = Math.max(22, width - 2);

  const children: ReturnType<typeof Box | typeof Text>[] = [
    Wordmark({ display, innerWidth }),
    Text({ content: "" }),
    Text({ content: "" }),
  ];

  if (data.mode === "queue") {
    children.push(...renderQueueBody(display, data, innerWidth, motion, observeProgress));
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
  motion: MotionController | undefined,
  observeProgress: ((reviewed: number) => number) | undefined,
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

  // Dataset path. Reserve `SIDEBAR_EDGE_BREATHING_ROOM` cells of right-side
  // breathing room so the path never butts up against the sidebar's right
  // edge — visual review showed a full-width path read as "overflow" even
  // when it fit.
  out.push(
    fixedRow(
      innerWidth,
      Text({
        content: segmentsToStyledText(
          [
            {
              text: truncateMiddle(data.datasetPath, innerWidth - SIDEBAR_EDGE_BREATHING_ROOM),
              tone: "muted",
            },
          ],
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
  out.push(counterRow(display, "reviewed", data.counters.reviewed, innerWidth, motion));
  out.push(counterRow(display, "skipped", data.counters.skipped, innerWidth, motion));
  out.push(counterRow(display, "marked", data.counters.marked, innerWidth, motion));
  out.push(blankRow());
  const tweened = observeProgress
    ? observeProgress(data.queueProgress.reviewed)
    : data.queueProgress.reviewed;
  out.push(progressRow(display, tweened, data.queueProgress.total, innerWidth));
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
          [
            {
              text: truncateMiddle(data.datasetPath, innerWidth - SIDEBAR_EDGE_BREATHING_ROOM),
              tone: "muted",
            },
          ],
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
  motion?: MotionController,
): ReturnType<typeof Box> {
  const countText = String(count);
  const gap = Math.max(2, innerWidth - visualWidth(label) - visualWidth(countText));
  // Counter flash (plan A12): when a decision/skip/mark just landed, the
  // matching `sidebar.counter.<label>` motion snapshot is active for the
  // flash duration. Tone the row accent so the increment registers as a
  // visible pulse rather than a silent number-bump.
  const motionKey = `sidebar.counter.${label}`;
  const active = motion?.snapshot(motionKey).active ?? false;
  const tone: Segment["tone"] = active ? "accent" : "default";
  return fixedRow(
    innerWidth,
    Text({
      content: segmentsToStyledText(
        [
          { text: label, tone },
          { text: " ".repeat(gap), tone: "default" },
          { text: countText, tone },
        ],
        display,
      ),
      attributes: active ? TextAttributes.BOLD : TextAttributes.NONE,
      wrapMode: "char",
    }),
  );
}

const PROGRESS_LABEL = "overall";

function progressRow(
  display: ResolvedDisplay,
  reviewed: number,
  total: number,
  innerWidth: number,
): ReturnType<typeof Box> {
  // Label + `reviewed/total` + bar + percent. The label is `overall`
  // (not `progress`) so it's explicit that this counts dataset-wide
  // reviews including prior sessions — the session counters above are
  // session-scoped. Showing `8/43` next to `19%` makes the source of
  // the percentage legible: without it a non-zero bar after a fresh
  // launch reads as a bug rather than "you reviewed 8 records earlier".
  // `reviewed` arrives as a float while the progress bar tweens (plan A12).
  // Round for the textual count so the label width stays stable (`13/43`
  // not `12.7/43`); the bar itself still uses the fractional value for
  // smooth fill steps.
  const countText = total > 0 ? `${Math.round(reviewed)}/${total}` : "0/0";
  const prefix = `${PROGRESS_LABEL} `;
  // `progressSegments` emits `[<bar>] <pct>` — that's 1 (`[`) + barWidth +
  // 2 (`] `) + 4 (` 37%` padStart) = barWidth + 7 cells. So we reserve 7
  // for the bar wrapper + percent, not 6 — earlier off-by-one pushed the
  // `%` onto a second row whenever the count column hit 5 chars.
  const reservedForBarChrome = 7;
  const reservedForCount = countText.length + 1;
  const barWidth = Math.max(
    4,
    Math.min(
      PROGRESS_BAR_WIDTH,
      innerWidth - prefix.length - reservedForCount - reservedForBarChrome,
    ),
  );
  const barSegs = progressSegments(reviewed, total, barWidth, display);
  return fixedRow(
    innerWidth,
    Text({
      content: segmentsToStyledText(
        [{ text: prefix, tone: "muted" }, { text: `${countText} `, tone: "dim" }, ...barSegs],
        display,
      ),
      wrapMode: "char",
    }),
  );
}

/**
 * Minimum width of the leading-glyph column in signal rows. Wide glyphs
 * (`⚠`, `⚡`) render 2 cells; narrow glyphs (`●`) render 1 cell. We pad
 * with spaces after the glyph so the label column always starts at the
 * same x. Per-row column expands if a glyph wider than the minimum slips
 * in (e.g. someone adds a 3-cell symbol to `issueGlyph`), so alignment
 * survives but the rows widen — better than silent overlap.
 */
const SIGNAL_GLYPH_MIN_COLUMN = 3;

function signalRow(
  display: ResolvedDisplay,
  signal: SidebarSignalRow,
  innerWidth: number,
): ReturnType<typeof Box> {
  const glyph = issueGlyph(signal.type, display);
  const glyphCells = visualWidth(glyph);
  // If `visualWidth` fell back to the U+2300..U+27FF heuristic (2 cells) for
  // a glyph not in the override map, alignment is a guess — fail loudly so
  // the override map gets updated rather than shipping silent misalignment.
  if (
    GLYPH_WIDTH_OVERRIDES[glyph] === undefined &&
    glyph.codePointAt(0) !== undefined &&
    (glyph.codePointAt(0) ?? 0) >= 0x2000
  ) {
    throw new Error(
      `signalRow: glyph ${JSON.stringify(glyph)} not in GLYPH_WIDTH_OVERRIDES — add it to keep sidebar columns aligned`,
    );
  }
  const glyphColumn = Math.max(SIGNAL_GLYPH_MIN_COLUMN, glyphCells + 1);
  const glyphPad = glyphColumn - glyphCells;
  const countText = String(signal.count);
  const countCells = visualWidth(countText);
  // Reserve `glyphColumn + label + ≥1ch gap + count`.
  const labelBudget = Math.max(4, innerWidth - glyphColumn - countCells - 1);
  const labelText = truncateEndSafe(signal.type, labelBudget);
  const used = glyphColumn + visualWidth(labelText) + countCells;
  const gap = Math.max(1, innerWidth - used);
  return fixedRow(
    innerWidth,
    Text({
      content: segmentsToStyledText(
        [
          { text: glyph, tone: "warning" },
          { text: " ".repeat(glyphPad), tone: "default" },
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

/** Re-export for callers — provides one Segment per fold result. */
export function pathSegments(path: string): Segment[] {
  return [{ text: path, tone: "muted" }];
}
