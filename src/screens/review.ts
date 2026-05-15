import type { CliRenderer } from "@opentui/core";
import { sql } from "drizzle-orm";
import { dispatch } from "../actions/dispatch.ts";
import { bindingsFor, type CommandRegistry, defaultRegistry } from "../actions/registry.ts";
import { type AppContext, enterReview } from "../app/context.ts";
import { labelName } from "../config/config.ts";
import { createChordResolver } from "../keymap/chord.ts";
import { applyEffects } from "../overlay/effects.ts";
import type { GuidelinesState } from "../overlay/guidelines.ts";
import { HELP_PAGE, type HelpState } from "../overlay/help.ts";
import { flashFooterHint, overlayFooterHint } from "../overlay/hints.ts";

import { reduceOverlay } from "../overlay/reduce.ts";
import type { NoteState, Overlay, PickerCandidate, PickerState } from "../overlay/types.ts";
import { BadgeLine, type BadgeVariant } from "../render/badge.ts";
import { BandedRecord } from "../render/banded-record.ts";
import { Box } from "../render/box.ts";
import { pickLayout, type ResolvedDisplay } from "../render/capability.ts";
import { Chrome, type Segment } from "../render/chrome/index.ts";
import { segmentsToStyledText } from "../render/chrome/status-bar.ts";
import { splitContextLines } from "../render/context-strip.ts";
import { renderFilterBuilder } from "../render/filter-view.ts";
import { issueGlyph, statusGlyph } from "../render/glyph-map.ts";
import { foldNamespace } from "../render/label-fold.ts";
import { Markdown } from "../render/markdown.ts";
import { renderPalette as renderPaletteV2 } from "../render/palette-view.ts";
import { progressBar } from "../render/progress-bar.ts";
import { sanitizeStatusText } from "../render/sanitize.ts";
import { Text, TextAttributes } from "../render/text.ts";
import { borderForRole, resolveTheme } from "../render/theme.ts";
import type { Db } from "../store/db.ts";
import { issuesForRecord, type StoredIssue } from "../store/issues.ts";
import { type HistoryEntry, progressCounts, recentReviewsWithText } from "../store/queries.ts";
import { type QueueId, resolveQueue } from "../store/queues/registry.ts";
import { hasTag } from "../store/tags.ts";
import type { RecordWithPrimaryPrediction, StoredReview } from "../types.ts";
import { renderDocView } from "./doc-view.ts";

function countPredictions(db: Db, recordId: string): number {
  return (
    db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM predictions WHERE record_id = ${recordId}`,
    )[0]?.n ?? 0
  );
}

export type ReviewScreenHandle = {
  destroy: () => void;
};

// Status glyphs come from `glyph-map.ts:statusGlyph` so the same set is
// used everywhere (history strip, audit-log export hints) and the mono
// fallback ASCII set is shared. Plan B10.

// Rows consumed below the band region: prediction card (~3 rows), issue
// badges (variable but commonly 0–2 here), label list (≤9 rows), note row,
// history block. Updated when the prediction line became a 3-row card.
const NON_BAND_ROWS = 16;
const MIN_WINDOW = 2;

export function mountReviewScreen(args: {
  renderer: CliRenderer;
  app: AppContext;
  registry?: CommandRegistry;
  initialQueueId?: QueueId;
}): ReviewScreenHandle {
  const { renderer, app } = args;
  const registry = args.registry ?? defaultRegistry();
  const initialQueueId = args.initialQueueId ?? "pending";
  enterReview(app, initialQueueId);
  app.commandRegistry = registry;
  app.activeScope = "review";
  const bindings = bindingsFor([...registry.values()]);
  let mounted = true;

  const chord = createChordResolver(bindings);
  const dispatchCommand = (name: string, argument?: string): Promise<void> =>
    dispatch(registry, app.activeScope ?? "review", app, name, argument).then(() => undefined);
  let lastDocViewActive = false;
  let lastOverlayActive = false;

  const renderState = () => {
    if (!mounted) return;
    for (const child of renderer.root.getChildren()) child.destroyRecursively();
    const docViewActive = app.docView !== null;
    const overlayActive = app.overlay !== null;
    if (docViewActive !== lastDocViewActive || overlayActive !== lastOverlayActive) {
      chord.reset();
      lastDocViewActive = docViewActive;
      lastOverlayActive = overlayActive;
    }
    const counts = progressCounts(app.db);
    const reviewedTotal = counts.accepted + counts.relabeled + counts.rejected;
    const flash = app.flash && app.flash.expiresAt > Date.now() ? app.flash : null;

    if (app.docView) {
      const docViewStatus = docViewStatusSegments(app);
      const docViewFooterHint = app.overlay
        ? overlayFooterHint(app.overlay)
        : flashFooterHint(flash, app.display);
      renderer.root.add(
        Chrome({
          display: app.display,
          app,
          scope: "doc-view",
          statusLeft: docViewStatus.left,
          statusRight: docViewStatus.right,
          footerHint: docViewFooterHint,
          width: renderer.terminalWidth,
          body: renderDocView(app, renderer.terminalHeight),
        }),
      );
      return;
    }

    const cursor = app.cursor;
    const queueId = app.queueId ?? initialQueueId;
    const bandRows = Math.max(8, renderer.terminalHeight - NON_BAND_ROWS);
    const mode = pickLayout(app.display.layout, renderer.terminalWidth);
    const pin = app.display.candidatePin;
    const prevN = Math.max(MIN_WINDOW, Math.floor(bandRows * pin));
    const nextN = Math.max(MIN_WINDOW, Math.floor(bandRows * (1 - pin)));
    const window = cursor?.window(prevN, nextN) ?? {
      records: [],
      focusedIndex: -1,
      startIndex: 0,
    };
    // When the cursor is near the top of the queue there are fewer
    // preceding records than the pin would reserve room for. Shrink the
    // top region proportionally so the focused row floats up to fill the
    // empty band rather than sitting in the middle of a tall void.
    // Boundary mode always renders contextLines above and below the
    // focused row, so the full pin is correct there.
    const hasContextStrip = app.config.task === "boundary";
    const effectivePin = hasContextStrip
      ? pin
      : prevN > 0
        ? Math.min(pin, (window.focusedIndex / prevN) * pin)
        : 0;
    const record = cursor?.current() ?? null;
    const history = recentReviewsWithText(app.db, 5);
    const marked = record ? hasTag(app.db, record.id, "marked") : false;
    const issues = record ? issuesForRecord(app.db, record.id) : [];
    const predictionCount = record ? countPredictions(app.db, record.id) : 0;
    const queueLabel = resolveQueue(queueId).label;
    const queueTotal = cursor?.total ?? 0;
    const queuePosition = queueTotal === 0 ? 0 : (cursor?.position ?? 0) + 1;
    const queueIndicator = queueTotal === 0 ? "0 / 0" : `${queuePosition} / ${queueTotal}`;

    const queueMotion = app.motion.snapshot("status.queue");
    const queueTone = queueMotion.active ? "info" : "accent";

    const statusLeft: Segment[] = [
      { text: " LabelLens", tone: "bold" },
      { text: "  ", tone: "dim" },
      { text: basename(app.config.input.path), tone: "muted" },
      { text: "  ", tone: "dim" },
      { text: queueLabel, tone: queueTone },
      { text: "  ", tone: "dim" },
      { text: queueIndicator, tone: "default" },
    ];
    if (marked) {
      statusLeft.push({ text: "   ● marked", tone: "warning" });
    }
    if (app.config.navigation?.smartNext && queueId === "pending") {
      statusLeft.push({ text: "   ▸ smart", tone: "accent" });
    }
    // Chord-pending chip (plan I2). When the reviewer has tapped the first
    // key of a chord (e.g. `g` waiting for `d` in `g d`), append `(g…)`
    // so the chord state is visible until it resolves or times out.
    const pendingChord = chord.pendingKey();
    if (pendingChord) {
      statusLeft.push({ text: `   (${pendingChord}…)`, tone: "accent" });
    }
    const statusRight: Segment[] = [
      { text: `Reviewed: ${reviewedTotal} / ${counts.total}`, tone: "muted" },
      { text: "  ·  ", tone: "dim" },
      { text: `Skipped: ${counts.skipped}`, tone: "muted" },
      { text: "  ·  ", tone: "dim" },
      { text: `Pending: ${counts.pending} `, tone: "muted" },
    ];

    const body = Box(
      { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
      mode === "split"
        ? splitBody({
            window,
            record,
            labels: app.config.labels,
            history,
            display: app.display,
            contextStrip: contextStripFor(app, record),
            issues,
            totalRecords: counts.total,
            predictionCount,
            effectivePin,
            marked,
          })
        : stackBody({
            window,
            record,
            labels: app.config.labels,
            contextStrip: contextStripFor(app, record),
            history,
            display: app.display,
            issues,
            totalRecords: counts.total,
            predictionCount,
            effectivePin,
            marked,
          }),
      app.overlay
        ? renderOverlay(app.overlay, app, renderer.terminalWidth, renderer.terminalHeight)
        : Box({}),
    );

    const footerHint = app.overlay
      ? overlayFooterHint(app.overlay)
      : flashFooterHint(flash, app.display);

    renderer.root.add(
      Chrome({
        display: app.display,
        app,
        scope: "review",
        statusLeft,
        statusRight,
        footerHint,
        width: renderer.terminalWidth,
        sidebar: app.getSidebarData("queue"),
        body,
      }),
    );
  };

  app.requestRender = renderState;

  const onKey = (event: { name: string; ctrl: boolean; shift: boolean; meta: boolean }) => {
    app.noteInput();
    if (app.overlay) {
      const result = reduceOverlay(app.overlay, { kind: "key", event });
      app.overlay = result.overlay;
      const queueId = app.queueId ?? initialQueueId;
      applyEffects(app, queueId, result.effects, dispatchCommand);
      if (mounted) renderState();
      return;
    }
    const scope = app.docView ? "doc-view" : "review";
    app.activeScope = scope;
    const action = chord.feed(scope, {
      name: event.name,
      ctrl: event.ctrl,
      shift: event.shift,
      meta: event.meta,
    });
    if (!action) return;
    void dispatch(registry, scope, app, action);
  };

  const onResize = () => renderState();

  renderer.keyInput.on("keypress", onKey);
  renderer.on("resize", onResize);
  renderState();

  return {
    destroy: () => {
      mounted = false;
      renderer.keyInput.off("keypress", onKey);
      renderer.off("resize", onResize);
    },
  };
}

type ContextStrip = { before: string[]; after: string[] };

type BodyArgs = {
  window: { records: RecordWithPrimaryPrediction[]; focusedIndex: number; startIndex: number };
  record: RecordWithPrimaryPrediction | null;
  labels: Parameters<typeof labelName>[0][];
  history: HistoryEntry[];
  display: ResolvedDisplay;
  contextStrip: ContextStrip | null;
  issues: StoredIssue[];
  totalRecords: number;
  predictionCount: number;
  /** Current record's marked tag state, threaded so prediction card can
   *  show the `⦿ marked` prefix without re-querying the store. */
  marked: boolean;
  /**
   * Pin position to *use* for layout this render. Differs from
   * `display.candidatePin` when there are fewer preceding records than the
   * pin would normally reserve space for — instead of leaving a band of
   * blank rows above the focus, we collapse the top region proportionally.
   */
  effectivePin: number;
};

function contextStripFor(
  app: AppContext,
  record: RecordWithPrimaryPrediction | null,
): ContextStrip | null {
  if (app.config.task !== "boundary" || !app.config.boundary || !record) return null;
  const n = app.config.boundary.contextLines;
  return {
    before: splitContextLines(record.context_before, n, "before"),
    after: splitContextLines(record.context_after, n, "after"),
  };
}

function stackBody(args: BodyArgs): ReturnType<typeof Box> {
  const {
    window,
    record,
    labels,
    history,
    display,
    contextStrip,
    issues,
    totalRecords,
    predictionCount,
    effectivePin,
  } = args;
  return Box(
    { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
    bandRegion(
      window.records,
      window.focusedIndex,
      window.startIndex,
      display,
      contextStrip,
      effectivePin,
    ),
    Box({ height: 1 }),
    predictionCard(record, display, args.marked),
    issueBadges(issues, totalRecords, predictionCount, display),
    record ? labelListBox(labels, record.primaryPrediction?.label ?? null, display) : Box({}),
    noteLine(record),
    Box({ height: 2 }),
    historyBlock(history, display),
  );
}

function splitBody(args: BodyArgs): ReturnType<typeof Box> {
  const {
    window,
    record,
    labels,
    history,
    display,
    contextStrip,
    issues,
    totalRecords,
    predictionCount,
    effectivePin,
  } = args;
  return Box(
    { flexDirection: "row", flexGrow: 1, overflow: "hidden" },
    // Main column: band region (prev above, focused pinned, after
    // below). Only this column reacts to navigation; the right column
    // stays put.
    Box(
      { flexDirection: "column", flexBasis: 0, flexGrow: 2, overflow: "hidden" },
      bandRegion(
        window.records,
        window.focusedIndex,
        window.startIndex,
        display,
        contextStrip,
        effectivePin,
      ),
    ),
    // Right column. Both metadata and history are pinned — top-anchored
    // and bottom-anchored respectively — so they stop dancing around
    // when the user scrolls the band:
    //   metadata block — prediction + badges + label list + note
    //   spacer (flexGrow: 1) — absorbs leftover height
    //   history block
    Box(
      {
        flexDirection: "column",
        flexBasis: 0,
        flexGrow: 1,
        paddingLeft: 1,
        paddingTop: 1,
        overflow: "hidden",
      },
      Box(
        {
          flexDirection: "column",
          flexShrink: 0,
        },
        predictionCard(record, display, args.marked),
        issueBadges(issues, totalRecords, predictionCount, display),
        record ? labelListBox(labels, record.primaryPrediction?.label ?? null, display) : Box({}),
        noteLine(record),
      ),
      Box({ flexBasis: 0, flexGrow: 1, flexShrink: 1 }),
      historyBlock(history, display),
    ),
  );
}

function issueBadges(
  issues: StoredIssue[],
  totalRecords: number,
  predictionCount: number,
  display: ResolvedDisplay,
): ReturnType<typeof Box> {
  if (issues.length === 0) return Box({});
  // Stable order so snapshots are deterministic regardless of insert order.
  const sorted = [...issues].sort((a, b) => a.type.localeCompare(b.type));
  return Box(
    { flexDirection: "column", marginTop: 2 },
    ...sorted.map((issue) =>
      BadgeLine({
        display,
        variant: badgeVariant(issue.type),
        // Per-type glyph (plan B11) — `⚠`, `⚡`, `⧉`, fallback `●`. Pulls
        // from the same `glyph-map.ts` table the sidebar Signals section
        // uses so both surfaces agree on glyphs.
        icon: issueGlyph(issue.type, display),
        label: badgeCopy(issue, totalRecords, predictionCount),
      }),
    ),
  );
}

function badgeVariant(issueType: StoredIssue["type"]): BadgeVariant {
  switch (issueType) {
    case "low_confidence":
      return "warning";
    case "source_disagreement":
      return "warning";
    case "exact_duplicate":
      return "info";
    default:
      return "neutral";
  }
}

function badgeCopy(issue: StoredIssue, totalRecords: number, predictionCount: number): string {
  const score = issue.score ?? 0;
  switch (issue.type) {
    case "low_confidence": {
      const confPct = Math.round((1 - score) * 100);
      return `Model is uncertain (confidence ${confPct}%)`;
    }
    case "source_disagreement": {
      // disagreementScore() only returns non-null for n >= 2, so a
      // source_disagreement issue implies the record had at least 2
      // predictions when signals ran. Trust the invariant.
      const n = predictionCount;
      const agreed = Math.max(1, Math.round((1 - score) * n));
      const sourcesWord = n === 1 ? "source" : "sources";
      return `Sources disagree on this record (${agreed}/${n} ${sourcesWord} agreed)`;
    }
    case "exact_duplicate": {
      const groupSize = Math.max(2, Math.round(score * totalRecords));
      return `Identical text appears ${groupSize} times in this dataset`;
    }
    default:
      return `${issue.type}${score ? ` (${score.toFixed(2)})` : ""}`;
  }
}

function confidenceTone(c: number | null): Segment["tone"] {
  if (c === null) return "muted";
  if (c >= 0.8) return "success";
  if (c >= 0.5) return "warning";
  return "danger";
}

const CONF_BAR_WIDTH = 9;

/**
 * Prediction card. Plan B6 + I1 + I3:
 *
 *   row 1 — `⦿ marked  ` (when tagged) + `◇ <label>` (ns-folded, bold) +
 *           `<bar> 74%` confidence inline.
 *   row 2 — source (ns-folded, dim).
 *   row 3 — `reason: <reason>` muted, when the prediction carries one.
 *
 * Multi-label upstream input is flattened to a single string at ingest
 * (`StoredPrediction.label: string`), so no array fallback needed here —
 * defensive multi-label rendering lives in the ingest layer.
 */
function predictionCard(
  record: RecordWithPrimaryPrediction | null,
  display: ResolvedDisplay,
  marked: boolean,
): ReturnType<typeof Box> {
  if (!record?.primaryPrediction) return Box({});
  const p = record.primaryPrediction;
  const rows: ReturnType<typeof Text>[] = [];

  // Row 1: marked? + ◇ + label + conf bar + %.
  const labelSegs = foldNamespace(p.label, "bold");
  const row1Segs: Segment[] = [{ text: " ", tone: "default" }];
  if (marked) {
    row1Segs.push({ text: "⦿ marked", tone: "warning" });
    row1Segs.push({ text: "  ", tone: "dim" });
  }
  row1Segs.push({ text: "◇ ", tone: "accent" });
  for (const seg of labelSegs) row1Segs.push(seg);
  if (p.confidence !== null) {
    const pct = Math.round(p.confidence * 100);
    const tone = confidenceTone(p.confidence);
    const bar = progressBar(pct, 100, CONF_BAR_WIDTH, display);
    row1Segs.push({ text: "  ", tone: "dim" });
    row1Segs.push({ text: bar, tone });
    row1Segs.push({ text: ` ${pct}%`, tone });
  }
  rows.push(
    Text({
      content: segmentsToStyledText(row1Segs, display),
      attributes: TextAttributes.BOLD,
    }),
  );

  // Row 2: source folded dim.
  const sourceSegs = foldNamespace(p.source, "muted");
  rows.push(
    Text({
      content: segmentsToStyledText([{ text: "   ", tone: "default" }, ...sourceSegs], display),
    }),
  );

  // Row 3: reason (when present).
  if (p.reason) {
    rows.push(
      Text({
        content: segmentsToStyledText(
          [
            { text: "   reason: ", tone: "muted" },
            { text: p.reason, tone: "default" },
          ],
          display,
        ),
      }),
    );
  }

  return Box({ flexDirection: "column" }, ...rows);
}

function noteLine(record: RecordWithPrimaryPrediction | null): ReturnType<typeof Box> {
  if (!record?.note) return Box({});
  return Box(
    { flexDirection: "row", marginTop: 2 },
    Text({
      content: ` note: ${truncate(record.note, 200)}${record.note.length > 200 ? " (press n for full)" : ""}`,
      attributes: TextAttributes.DIM,
    }),
  );
}

const STATUS_TONE: Record<StoredReview["status"], Segment["tone"]> = {
  accepted: "success",
  relabeled: "info",
  rejected: "danger",
  skipped: "muted",
  undone: "warning",
  pending: "dim",
};

function historyBlock(history: HistoryEntry[], display: ResolvedDisplay): ReturnType<typeof Box> {
  if (history.length === 0) return Box({});

  // Cap label column at 12 cells so a long label (e.g. `policy:spam`) does
  // not stretch the right column past its share of the split. Labels longer
  // than the cap render unpadded and push the record text rightward — they
  // stay readable, the column just stops contributing to alignment.
  const labelWidth = Math.min(
    12,
    history.reduce((m, h) => Math.max(m, labelOrDash(h.final_label ?? h.prev_label).length), 0),
  );

  return Box(
    { flexDirection: "column", flexShrink: 0, paddingBottom: 1 },
    Text({
      content: segmentsToStyledText([{ text: " history", tone: "accent" }], display),
      attributes: TextAttributes.BOLD,
    }),
    Text({ content: "" }),
    ...history.flatMap((h, i) => {
      const glyph = statusGlyph(h.status, display);
      const label = labelOrDash(h.final_label ?? h.prev_label);
      // Namespace fold splits `policy:spam` into `policy:` dim + `spam`
      // bold. Plain labels (no `:` / `.`) come back as a single bold
      // segment. Pad-end happens on the value portion so columns still
      // align across rows.
      const foldedLabel = foldLabelForHistory(label, labelWidth);
      const segs: Segment[] = [
        { text: " ", tone: "default" },
        { text: glyph, tone: STATUS_TONE[h.status] ?? "default" },
        { text: "  ", tone: "default" },
        ...foldedLabel,
        { text: "  ", tone: "dim" },
        { text: truncate(h.recordText, 32), tone: "muted" },
      ];
      const row = Text({ content: segmentsToStyledText(segs, display) });
      if (i === 0) return [row];
      // Sparse ⋅ rule between entries — 4 repeats × 14-cell stride covers
      // the typical history-row width (~56 cells). Width is fixed rather
      // than computed because the right column itself caps near 60 cols
      // in split mode and we want consistent spacing across capabilities.
      const sepText = " ⋅            ".repeat(4);
      const sep = Text({
        content: segmentsToStyledText([{ text: sepText, tone: "dim" }], display),
      });
      return [sep, row];
    }),
  );
}

/**
 * Apply namespace fold to a label and pad the value portion (or the entire
 * label when no namespace) to `width` so adjacent rows align. Dash labels
 * (`labelOrDash` placeholder `—`) skip the fold to avoid splitting on `.`
 * inside the dash glyph (none today, but defensive).
 */
function foldLabelForHistory(label: string, width: number): Segment[] {
  if (label === "—") {
    return [{ text: label.padEnd(width, " "), tone: "bold" }];
  }
  const segs = foldNamespace(label, "bold");
  if (segs.length === 1) {
    return [{ ...segs[0], text: segs[0]!.text.padEnd(width, " ") }];
  }
  // Two-segment fold: prefix (dim) + value (bold). Pad value.
  const last = segs[segs.length - 1]!;
  const padded = last.text.padEnd(Math.max(0, width - (label.length - last.text.length)), " ");
  return [...segs.slice(0, -1), { ...last, text: padded }];
}

function labelOrDash(s: string | null): string {
  return s ?? "—";
}

function bandRegion(
  records: RecordWithPrimaryPrediction[],
  focusedIndex: number,
  startIndex: number,
  display: ResolvedDisplay,
  contextStrip: ContextStrip | null = null,
  pinOverride?: number,
): ReturnType<typeof Box> {
  if (records.length === 0 || focusedIndex < 0) {
    return Box(
      { flexGrow: 1, padding: 2 },
      Text({
        content: "All records reviewed. Press q to quit.",
        attributes: TextAttributes.DIM,
      }),
    );
  }

  const focused = records[focusedIndex]!;
  const pin = pinOverride ?? display.candidatePin;
  const focusedAbsolute = startIndex + focusedIndex;

  const beforeChildren = contextStrip
    ? [
        ...contextStrip.before.map((line, i) =>
          BandedRecord({
            text: line,
            isFocused: false,
            bandSlot: slotFor(i),
            display,
            variant: "context",
          }),
        ),
        // Plan F4 — dashed separator above focused row in boundary mode
        // so the reviewer sees the context strip is *this record's*
        // neighbourhood, not sibling records.
        contextSeparator(display),
      ]
    : records.slice(0, focusedIndex).map((r, i) =>
        BandedRecord({
          text: r.text,
          isFocused: false,
          bandSlot: slotFor(startIndex + i),
          display,
          confidence: r.primaryPrediction?.confidence ?? null,
        }),
      );

  const afterChildren = contextStrip
    ? [
        contextSeparator(display),
        ...contextStrip.after.map((line, i) =>
          BandedRecord({
            text: line,
            isFocused: false,
            bandSlot: slotFor(i),
            display,
            variant: "context",
          }),
        ),
      ]
    : records.slice(focusedIndex + 1).map((r, i) =>
        BandedRecord({
          text: r.text,
          isFocused: false,
          bandSlot: slotFor(focusedAbsolute + 1 + i),
          display,
          confidence: r.primaryPrediction?.confidence ?? null,
        }),
      );

  return Box(
    { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
    Box(
      {
        flexDirection: "column",
        flexBasis: 0,
        flexGrow: pin,
        flexShrink: 0,
        justifyContent: "flex-end",
        overflow: "hidden",
      },
      ...beforeChildren,
    ),
    Box(
      {
        flexDirection: "column",
        flexBasis: 0,
        flexGrow: 1 - pin,
        flexShrink: 1,
        overflow: "hidden",
      },
      BandedRecord({
        text: focused.text,
        isFocused: true,
        bandSlot: slotFor(focusedAbsolute),
        display,
      }),
      ...afterChildren,
    ),
  );
}

function slotFor(absoluteIndex: number): "even" | "odd" {
  return absoluteIndex % 2 === 0 ? "even" : "odd";
}

/**
 * Dashed rule that divides the boundary-task context strip from the
 * focused row. Plan F4. The rule reads as "this is where the record's
 * own neighbourhood ends and the focused candidate begins". Length is
 * generous (60 chars) so it fills typical band-column widths; the
 * containing Box clips overflow.
 */
function contextSeparator(display: ResolvedDisplay): ReturnType<typeof Text> {
  return Text({
    content: segmentsToStyledText([{ text: ` ${"─".repeat(60)}`, tone: "dim" }], display),
    attributes: TextAttributes.DIM,
  });
}

/**
 * Compact alternatives list (plan B7). The predicted label is already in
 * the prediction card above; this list is the relabel keymap surface —
 * one row per configured label with a `[N]` accelerator chip and
 * namespace-folded value. The predicted row keeps a subtle `✓` marker
 * but no longer carries the accent weight (the card above is the
 * headline emphasis).
 */
function labelListBox(
  labels: Parameters<typeof labelName>[0][],
  predicted: string | null,
  display: ResolvedDisplay,
): ReturnType<typeof Box> {
  return Box(
    { flexDirection: "column", marginTop: 2 },
    ...labels.slice(0, 9).map((entry, idx) => {
      const name = labelName(entry);
      const isPredicted = name === predicted;
      const folded = foldNamespace(name, isPredicted ? "default" : "muted");
      const segs: Segment[] = [
        { text: " [", tone: "dim" },
        { text: String(idx + 1), tone: "accent" },
        { text: "]  ", tone: "dim" },
        ...folded,
      ];
      if (isPredicted) {
        segs.push({ text: "  ", tone: "dim" });
        segs.push({ text: "✓", tone: "success" });
      }
      return Text({
        content: segmentsToStyledText(segs, display),
        attributes: isPredicted ? TextAttributes.BOLD : TextAttributes.NONE,
      });
    }),
  );
}

function modalBox(
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
  widthFraction: number,
  // biome-ignore lint/suspicious/noExplicitAny: mixed VNode children (Text, Markdown, etc.)
  ...children: any[]
): ReturnType<typeof Box> {
  const border = borderForRole(display, "overlay");
  const t = resolveTheme(display);
  const modalWidth = Math.max(50, Math.min(80, Math.floor(termWidth * widthFraction)));
  const leftOffset = Math.max(0, Math.floor((termWidth - modalWidth - 2) / 2));
  const topOffset = Math.max(1, Math.floor(termHeight * 0.12));
  const modalHeight = Math.max(12, termHeight - topOffset * 2 - 2);
  return Box(
    {
      flexDirection: "column",
      borderStyle: border,
      padding: 1,
      position: "absolute",
      top: topOffset,
      left: leftOffset,
      width: modalWidth,
      height: modalHeight,
      zIndex: 100,
      shouldFill: true,
      overflow: "hidden",
      backgroundColor: t.bg.overlay !== "transparent" ? t.bg.overlay : undefined,
    },
    ...children,
  );
}

function renderOverlay(
  overlay: Overlay,
  app: AppContext,
  termWidth: number,
  termHeight: number,
): ReturnType<typeof Box> {
  const display = app.display;
  switch (overlay.kind) {
    case "picker":
      return renderPicker(overlay.state, display, termWidth, termHeight);
    case "note":
      return renderNote(overlay.state, display, termWidth, termHeight);
    case "assistant":
      return modalBox(
        display,
        termWidth,
        termHeight,
        0.5,
        Text({ content: " assistant overlay (slice 11)" }),
      );
    case "palette":
      return renderPaletteV2(
        overlay.state,
        display,
        termWidth,
        termHeight,
        app.motion.snapshot("palette.open").progress,
      );
    case "filter-builder":
      return renderFilterBuilder(overlay.state, display, termWidth, termHeight);
    case "help":
      return renderHelp(overlay.state, display, termWidth, termHeight);
    case "guidelines":
      return renderGuidelines(overlay.state, display, termWidth, termHeight);
    case "stats":
      return renderStatsOverlay(overlay.state, display, termWidth, termHeight);
  }
}

function renderGuidelines(
  state: GuidelinesState,
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
): ReturnType<typeof Box> {
  const lines = state.content.split("\n");
  const total = lines.length;
  const start = Math.min(state.scroll, Math.max(total - 1, 0));
  const sliced = lines.slice(start).join("\n");
  const moreAbove = start > 0;
  const titleSuffix = total > 1 ? `   line ${start + 1}/${total}` : "";
  return modalBox(
    display,
    termWidth,
    termHeight,
    0.7,
    Text({ content: ` ${state.title}${titleSuffix}${moreAbove ? "   ↑ above" : ""}` }),
    Box(
      { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
      Markdown({ content: sliced }),
    ),
    Text({
      content: " ↑/↓ scroll · pgup/pgdn page · esc close",
      attributes: TextAttributes.DIM,
    }),
  );
}

function renderHelp(
  state: HelpState,
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
): ReturnType<typeof Box> {
  const visible = state.entries.slice(state.scroll, state.scroll + HELP_PAGE);
  const more = state.entries.length - state.scroll - visible.length;
  return modalBox(
    display,
    termWidth,
    termHeight,
    0.6,
    Text({
      content: ` help · ${state.scope} · ${state.entries.length} commands${more > 0 ? `   (+${more} more, ↓ to scroll)` : ""}`,
    }),
    Box(
      { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
      ...visible.map((e) =>
        Text({
          content: ` ${e.binding.padEnd(10)} ${e.name}${e.palette ? `   ${e.palette}` : ""}`,
          attributes: TextAttributes.DIM,
        }),
      ),
    ),
    Text({ content: " ↑/↓ scroll · esc close", attributes: TextAttributes.DIM }),
  );
}

function renderStatsOverlay(
  state: import("../overlay/stats-overlay.ts").StatsOverlayState,
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
): ReturnType<typeof Box> {
  const PAGE = 20;
  const visible = state.lines.slice(state.scroll, state.scroll + PAGE);
  const more = state.lines.length - state.scroll - visible.length;
  return modalBox(
    display,
    termWidth,
    termHeight,
    0.7,
    Text({
      content: ` Stats${more > 0 ? `   (+${more} more, ↓ to scroll)` : ""}`,
      attributes: TextAttributes.BOLD,
    }),
    Box(
      { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
      ...visible.map((line) =>
        Text({
          content: line.display,
          attributes: line.isHeader ? TextAttributes.BOLD : TextAttributes.DIM,
        }),
      ),
    ),
    Text({ content: " ↑/↓ scroll · esc close", attributes: TextAttributes.DIM }),
  );
}

function renderPicker(
  state: PickerState,
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
): ReturnType<typeof Box> {
  return modalBox(
    display,
    termWidth,
    termHeight,
    0.5,
    Text({ content: ` relabel> ${state.filter}_` }),
    ...state.candidates.slice(0, 9).map((c: PickerCandidate, i) =>
      Text({
        content: ` ${i + 1} ${c.label}${c.predicted ? " >" : ""}${i === state.highlight ? "  <-" : ""}`,
        attributes: i === state.highlight ? TextAttributes.BOLD : TextAttributes.DIM,
      }),
    ),
    Text({
      content: " enter commit · esc cancel",
      attributes: TextAttributes.DIM,
    }),
  );
}

function renderNote(
  state: NoteState,
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
): ReturnType<typeof Box> {
  return modalBox(
    display,
    termWidth,
    termHeight,
    0.5,
    Text({ content: ` note> ${state.value}_` }),
    Text({
      content: " enter save · esc cancel",
      attributes: TextAttributes.DIM,
    }),
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

function docViewStatusSegments(app: AppContext): { left: Segment[]; right: Segment[] } {
  const doc = app.docView!;
  return {
    left: [
      { text: " Doc view", tone: "bold" },
      { text: "  ", tone: "dim" },
      { text: sanitizeStatusText(doc.documentId), tone: "accent" },
    ],
    right: [
      { text: basename(app.config.input.path), tone: "muted" },
      { text: " ", tone: "muted" },
    ],
  };
}
