import type { CliRenderer } from "@opentui/core";
import { sql } from "drizzle-orm";
import { dispatch } from "../actions/dispatch.ts";
import { bindingsFor, type CommandRegistry, defaultRegistry } from "../actions/registry.ts";
import { type AppContext, enterReview } from "../app/context.ts";
import { labelName } from "../config/config.ts";
import { createChordResolver } from "../keymap/chord.ts";
import { applyEffects } from "../overlay/effects.ts";
import { GUIDELINES_PAGE, type GuidelinesState } from "../overlay/guidelines.ts";
import { HELP_PAGE, type HelpState } from "../overlay/help.ts";
import { flashFooterHint } from "../overlay/hints.ts";
import type { QueueState } from "../overlay/queue.ts";
import { reduceOverlay } from "../overlay/reduce.ts";
import type { NoteState, Overlay, PickerCandidate, PickerState } from "../overlay/types.ts";
import { pulse } from "../render/anim.ts";
import { BadgeLine, type BadgeVariant } from "../render/badge.ts";
import { BandedRecord } from "../render/banded-record.ts";
import { Box } from "../render/box.ts";
import { pickLayout, type ResolvedDisplay } from "../render/capability.ts";
import { Chrome, type Segment } from "../render/chrome/index.ts";
import { segmentsToStyledText } from "../render/chrome/status-bar.ts";
import { splitContextLines } from "../render/context-strip.ts";
import { EmptyState } from "../render/empty-state.ts";
import { renderFilterBuilder } from "../render/filter-view.ts";
import { issueGlyph, kindTintLevel, labelGlyph, statusGlyph } from "../render/glyph-map.ts";
import { foldNamespace } from "../render/label-fold.ts";
import { Markdown } from "../render/markdown.ts";
import { ModalHeader } from "../render/modal-frame.ts";
import { renderPalette as renderPaletteV2 } from "../render/palette-view.ts";
import { progressBar } from "../render/progress-bar.ts";
import { progressSegments } from "../render/progress-segments.ts";
import { sanitizeStatusText } from "../render/sanitize.ts";
import { Scrollbar } from "../render/scrollbar.ts";
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
  // Track chord pending key across renders so we only start the fade-out
  // motion on transition (calling play() per frame would reset progress).
  let lastChordKey: string | null = null;

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
      // Plan C5: overlay open → keep the underlying scope's shortcut bar
      // visible (each overlay renders its own hint row INSIDE its modal).
      // Only flashes still override the footer.
      const flashActive = !app.overlay && flash !== null;
      const docViewFooterHint = app.overlay
        ? undefined
        : flashFooterHint(flash, app.display, flashActive);
      renderer.root.add(
        Chrome({
          display: app.display,
          app,
          scope: "doc-view",
          statusLeft: docViewStatus.left,
          statusRight: docViewStatus.right,
          footerHint: docViewFooterHint,
          flashKind: flashActive ? flash.kind : undefined,
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
      statusLeft.push({ text: "   ⦿ marked", tone: "warning" });
    }
    if (app.config.navigation?.smartNext && queueId === "pending") {
      statusLeft.push({ text: "   ▸ smart", tone: "accent" });
    }
    // Chord-pending chip (plan I2). When the reviewer has tapped the first
    // key of a chord (e.g. `g` waiting for `d` in `g d`), append `(g…)`
    // so the chord state is visible until it resolves or times out. Tone
    // fades from accent → muted across the chord window as the timeout
    // approaches, cueing how much time is left.
    const pendingChord = chord.pendingKey();
    if (pendingChord !== lastChordKey) {
      if (pendingChord) app.motion.play("chord:pending", pulse(chord.windowMs, "accent"));
      lastChordKey = pendingChord;
    }
    if (pendingChord) {
      const snap = app.motion.snapshot("chord:pending");
      const tone = snap.active && snap.progress >= 0.5 ? "muted" : "accent";
      statusLeft.push({ text: `   (${pendingChord}…)`, tone });
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
            boundary: boundaryRowMetaFor(app.config, app.display),
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
            boundary: boundaryRowMetaFor(app.config, app.display),
          }),
      app.overlay
        ? renderOverlay(app.overlay, app, renderer.terminalWidth, renderer.terminalHeight)
        : Box({}),
    );

    // Plan C5: overlay open → keep the review-scope shortcut bar visible
    // (each overlay renders its own hint row INSIDE its modal). Flashes
    // still override the footer.
    const flashActive = !app.overlay && flash !== null;
    const footerHint = app.overlay ? undefined : flashFooterHint(flash, app.display, flashActive);

    renderer.root.add(
      Chrome({
        display: app.display,
        app,
        scope: "review",
        statusLeft,
        statusRight,
        footerHint,
        flashKind: flashActive ? flash.kind : undefined,
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
  /**
   * Boundary-task per-row meta lookup (label → glyph + tint). Null for
   * classification tasks — band region falls back to confidence-only
   * left edge.
   */
  boundary: BoundaryRowMeta | null;
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
    boundary,
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
      boundary,
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
    boundary,
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
        boundary,
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
  boundary: BoundaryRowMeta | null = null,
): ReturnType<typeof Box> {
  if (records.length === 0 || focusedIndex < 0) {
    const rich = display.color === "truecolor" || display.color === "256";
    return EmptyState({
      display,
      glyph: rich ? "✓" : "*",
      glyphTone: "success",
      message: "All records reviewed",
      hint: "[/] switch queue · [q] quit",
    });
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
    : records.slice(0, focusedIndex).map((r, i) => {
        const meta = boundaryMetaFor(r, boundary);
        return BandedRecord({
          text: r.text,
          isFocused: false,
          bandSlot: slotFor(startIndex + i),
          display,
          confidence: r.primaryPrediction?.confidence ?? null,
          kindGlyph: meta?.kindGlyph,
          kindTintLevel: meta?.kindTintLevel,
        });
      });

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
    : records.slice(focusedIndex + 1).map((r, i) => {
        const meta = boundaryMetaFor(r, boundary);
        return BandedRecord({
          text: r.text,
          isFocused: false,
          bandSlot: slotFor(focusedAbsolute + 1 + i),
          display,
          confidence: r.primaryPrediction?.confidence ?? null,
          kindGlyph: meta?.kindGlyph,
          kindTintLevel: meta?.kindTintLevel,
        });
      });

  return Box(
    { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
    Box(
      {
        flexDirection: "column",
        flexBasis: contextStrip ? beforeChildren.length : 0,
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
      (() => {
        const meta = boundaryMetaFor(focused, boundary);
        return BandedRecord({
          text: focused.text,
          isFocused: true,
          bandSlot: slotFor(focusedAbsolute),
          display,
          kindGlyph: meta?.kindGlyph,
          kindTintLevel: meta?.kindTintLevel,
        });
      })(),
      ...afterChildren,
    ),
  );
}

function slotFor(absoluteIndex: number): "even" | "odd" {
  return absoluteIndex % 2 === 0 ? "even" : "odd";
}

/**
 * Per-row boundary metadata: looked up once per render from
 * `app.config.labels`. Maps label name → optional config-supplied glyph and
 * the built-in kind-tint level. Classification tasks pass `null` so the
 * band region falls back to confidence-only left edge + even/odd banding.
 */
type BoundaryRowMeta = {
  display: ResolvedDisplay;
  glyphByLabel: Map<string, string | undefined>;
};

function boundaryRowMetaFor(
  config: import("../config/config.ts").LabellensConfig,
  display: ResolvedDisplay,
): BoundaryRowMeta | null {
  if (config.task !== "boundary") return null;
  const glyphByLabel = new Map<string, string | undefined>();
  for (const entry of config.labels) {
    if (typeof entry === "object") glyphByLabel.set(entry.name, entry.glyph);
  }
  return { display, glyphByLabel };
}

function boundaryMetaFor(
  record: RecordWithPrimaryPrediction,
  boundary: BoundaryRowMeta | null,
): { kindGlyph?: string; kindTintLevel?: ReturnType<typeof kindTintLevel> | null } | null {
  if (!boundary) return null;
  const label = record.primaryPrediction?.label;
  if (!label) return null;
  const configGlyph = boundary.glyphByLabel.get(label);
  return {
    kindGlyph: labelGlyph(label, configGlyph, boundary.display),
    kindTintLevel: kindTintLevel(label),
  };
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
  title: string,
  // biome-ignore lint/suspicious/noExplicitAny: mixed VNode children (Text, Markdown, etc.)
  ...children: any[]
): ReturnType<typeof Box> {
  const border = borderForRole(display, "overlay");
  const t = resolveTheme(display);
  const overlayBg = t.bg.overlay !== "transparent" ? t.bg.overlay : "black";
  const modalWidth = Math.max(50, Math.min(80, Math.floor(termWidth * widthFraction)));
  const leftOffset = Math.max(0, Math.floor((termWidth - modalWidth - 2) / 2));
  const topOffset = Math.max(1, Math.floor(termHeight * 0.12));
  const modalHeight = Math.max(12, termHeight - topOffset * 2 - 2);
  return Box(
    {
      flexDirection: "column",
      borderStyle: border,
      borderColor: t.fg.accent,
      padding: 1,
      position: "absolute",
      top: topOffset,
      left: leftOffset,
      width: modalWidth,
      height: modalHeight,
      zIndex: 100,
      shouldFill: true,
      overflow: "hidden",
      backgroundColor: overlayBg,
    },
    ModalHeader({ display, title, innerWidth: modalWidth - 4 }),
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
        "Assistant",
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
    case "queue":
      return renderQueueOverlay(overlay.state, display, termWidth, termHeight);
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
  // Plan G4: substitute h1/h2 with the modal-header dash pattern so the
  // guidelines body reads with section breaks consistent with overlay
  // headers (`══ Title ════════════════════`). Higher-level headers
  // (h3+) stay as native markdown rendering.
  const dashed = applyQuadrantHeaders(lines.slice(start).join("\n"));
  const moreAbove = start > 0;
  const titleSuffix = total > 1 ? `   line ${start + 1}/${total}` : "";
  // Approximation for the scrollbar's visible window — markdown render
  // height varies per node, so the reducer's page constant is a hint, not
  // a pixel-perfect viewport mapping.
  return modalBox(
    display,
    termWidth,
    termHeight,
    0.7,
    `${state.title}${titleSuffix}${moreAbove ? "  ↑ above" : ""}`,
    Box(
      { flexDirection: "row", flexGrow: 1, overflow: "hidden" },
      Box(
        { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
        Markdown({ content: dashed }),
      ),
      Scrollbar({
        display,
        total,
        visible: GUIDELINES_PAGE,
        scrollTop: start,
        caps: true,
      }),
    ),
    Text({
      content: " ↑/↓ scroll · pgup/pgdn page · esc close",
      attributes: TextAttributes.DIM,
    }),
  );
}

/**
 * Rewrite `# Title` and `## Title` lines as bolded `══ Title ══════════…`
 * runs (plan G4). Markdown's heading renderer still picks up the leading
 * `**…**` so the result reads as a bold section break that mirrors the
 * modal-header treatment. h3+ are left alone — markdown handles them.
 */
function applyQuadrantHeaders(content: string): string {
  const flank = "═".repeat(28);
  return content
    .split("\n")
    .map((line) => {
      const h1 = line.match(/^# (.*)$/);
      if (h1) return `**══ ${h1[1]} ${flank}**`;
      const h2 = line.match(/^## (.*)$/);
      if (h2) return `**══ ${h2[1]} ${flank}**`;
      return line;
    })
    .join("\n");
}

function renderHelp(
  state: HelpState,
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
): ReturnType<typeof Box> {
  const rich = display.color === "truecolor" || display.color === "256";
  const visible = state.entries.slice(state.scroll, state.scroll + HELP_PAGE);
  const more = state.entries.length - state.scroll - visible.length;
  // Plan G3: insert section sub-headers when the entry's category flips.
  // Categories come from command-name prefix (`palette`, `queue`, `record`,
  // `app`, `export`, `guidelines`, `help`, `stats`, `doc`). Title-case them
  // for display.
  type Row =
    | { kind: "section"; label: string }
    | { kind: "entry"; entry: (typeof visible)[number] };
  const rows: Row[] = [];
  // We need to know the cross-page category at scroll boundary so the
  // first visible page still shows its section header. Find the category
  // of the entry just before `scroll` — if different from the first
  // visible's category, render a header. If scroll === 0, always render.
  let prevCat = state.scroll > 0 ? state.entries[state.scroll - 1]?.category : undefined;
  for (const e of visible) {
    if (e.category !== prevCat) {
      rows.push({ kind: "section", label: sectionLabel(e.category) });
      prevCat = e.category;
    }
    rows.push({ kind: "entry", entry: e });
  }
  return modalBox(
    display,
    termWidth,
    termHeight,
    0.6,
    `Help · ${state.scope}${more > 0 ? `   (+${more} more)` : ""}`,
    Box(
      { flexDirection: "row", flexGrow: 1, overflow: "hidden" },
      Box(
        { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
        ...rows.map((r) => {
          if (r.kind === "section") {
            const rule = rich ? "─".repeat(28) : "-".repeat(28);
            const content = ` ${r.label}  ${rule}`;
            return Text({
              content: rich
                ? segmentsToStyledText(
                    [
                      { text: ` ${r.label}  `, tone: "muted" },
                      { text: rule, tone: "accentDeep" },
                    ],
                    display,
                  )
                : content,
              attributes: rich ? TextAttributes.BOLD : TextAttributes.BOLD,
            });
          }
          const e = r.entry;
          return Text({
            content: ` ${e.binding.padEnd(10)} ${e.name}${e.palette ? `   ${e.palette}` : ""}`,
            attributes: TextAttributes.DIM,
          });
        }),
      ),
      Scrollbar({
        display,
        total: state.entries.length,
        visible: HELP_PAGE,
        scrollTop: state.scroll,
        caps: true,
      }),
    ),
    Text({ content: " ↑/↓ scroll · esc close", attributes: TextAttributes.DIM }),
  );
}

function sectionLabel(category: string | undefined): string {
  if (!category) return "Other";
  // Mapping aligned with plan G3 + the command-name prefix scheme. Unknown
  // prefixes fall back to title-case of the prefix itself.
  switch (category) {
    case "record":
      return "Record";
    case "queue":
      return "Queue";
    case "stats":
      return "Stats";
    case "doc":
      return "Doc view";
    case "palette":
      return "Palette";
    case "guidelines":
      return "Guidelines";
    case "help":
      return "Help";
    case "export":
      return "Export";
    case "app":
      return "Global";
    default:
      return category.charAt(0).toUpperCase() + category.slice(1);
  }
}

function renderQueueOverlay(
  state: QueueState,
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
): ReturnType<typeof Box> {
  const rich = display.color === "truecolor" || display.color === "256";
  const PROGRESS_WIDTH = 8;
  const modalWidth = Math.max(50, Math.min(80, Math.floor(termWidth * 0.7)));
  const innerWidth = modalWidth - 4;
  const flatRows = state.sections.flatMap((s) => s.rows);
  const longestLabel = flatRows.reduce((m, r) => Math.max(m, r.label.length), 0);
  const highlighted = flatRows[state.highlight];

  const sectionBlocks: ReturnType<typeof Box>[] = [];
  let rowIdx = 0;
  for (let si = 0; si < state.sections.length; si++) {
    const section = state.sections[si]!;
    const heading = rich ? ` ${section.icon}  ${section.title}` : ` ${section.title}`;
    const children: ReturnType<typeof Box>[] = [
      fixedTextRow(
        Text({
          content: rich
            ? segmentsToStyledText([{ text: heading, tone: "muted" }], display)
            : heading,
          attributes: TextAttributes.BOLD,
        }),
      ),
    ];
    for (const row of section.rows) {
      const isHighlight = rowIdx === state.highlight;
      const marker = isHighlight ? ">" : " ";
      const paddedLabel = row.label.padEnd(longestLabel, " ");
      const countText = String(row.count);
      const countTone: Segment["tone"] = row.count > 0 ? "accent" : "dim";
      const progress = progressSegments(row.count, state.totalRecords, PROGRESS_WIDTH, display);
      const fixedCells =
        3 + longestLabel + 2 + 4 + 2 + progress.reduce((n, s) => n + s.text.length, 0) + 2;
      const descBudget = Math.max(0, innerWidth - fixedCells);
      const segs: Segment[] = [
        { text: ` ${marker} `, tone: isHighlight ? "accent" : "default" },
        {
          text: paddedLabel,
          tone: isHighlight ? "accent" : row.count > 0 ? "default" : "dim",
        },
        { text: "  ", tone: "dim" },
        { text: countText.padStart(4, " "), tone: countTone },
        { text: "  ", tone: "dim" },
        ...progress,
        { text: "  ", tone: "dim" },
        { text: truncateEnd(row.description, descBudget), tone: "dim" },
      ];
      children.push(
        fixedTextRow(
          Text({
            content: rich ? segmentsToStyledText(segs, display) : segs.map((s) => s.text).join(""),
            attributes: isHighlight ? TextAttributes.BOLD : TextAttributes.NONE,
            wrapMode: "char",
          }),
        ),
      );
      rowIdx++;
    }
    sectionBlocks.push(Box({ flexDirection: "column" }, ...children));
    if (si < state.sections.length - 1) sectionBlocks.push(Box({ height: 1 }));
  }

  const previewChildren: ReturnType<typeof Text>[] = [];
  if (highlighted) {
    const heading: Segment[] = [
      { text: " Preview: ", tone: "dim" },
      { text: highlighted.label, tone: "accent" },
    ];
    previewChildren.push(
      Text({
        content: rich
          ? segmentsToStyledText(heading, display)
          : heading.map((s) => s.text).join(""),
        attributes: TextAttributes.BOLD,
        wrapMode: "char",
      }),
    );
    const record = highlighted.preview;
    if (!record) {
      previewChildren.push(Text({ content: "   (no records)", attributes: TextAttributes.DIM }));
    } else {
      const PREVIEW_MAX = 80;
      const previewText =
        record.text.length <= PREVIEW_MAX
          ? record.text
          : `${record.text.slice(0, PREVIEW_MAX - 1)}…`;
      previewChildren.push(
        Text({
          content: `   ${previewText}`,
          wrapMode: "char",
        }),
      );
      const p = record.primaryPrediction;
      if (p) {
        const conf = p.confidence !== null ? `${Math.round(p.confidence * 100)}%` : "—";
        const meta: Segment[] = [
          { text: "   ", tone: "default" },
          { text: `src ${p.source}`, tone: "muted" },
          { text: "   ", tone: "dim" },
          { text: p.label, tone: "accent" },
          { text: "   ", tone: "dim" },
          { text: conf, tone: "muted" },
        ];
        previewChildren.push(
          Text({
            content: rich ? segmentsToStyledText(meta, display) : meta.map((s) => s.text).join(""),
            wrapMode: "char",
          }),
        );
      }
    }
  }

  return modalBox(
    display,
    termWidth,
    termHeight,
    0.7,
    "Queues",
    Box({ flexDirection: "column" }, ...sectionBlocks),
    Box({ height: 1 }),
    Box({ flexDirection: "column" }, ...previewChildren),
    Box({ flexGrow: 1 }),
    Text({
      content: " [j/k] navigate · [enter] select · [esc] cancel",
      attributes: TextAttributes.DIM,
    }),
  );
}

function fixedTextRow(text: ReturnType<typeof Text>): ReturnType<typeof Box> {
  return Box({ height: 1, flexShrink: 0 }, text);
}

function truncateEnd(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  if (max === 1) return "…";
  return `${s.slice(0, max - 1)}…`;
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
    `Stats${more > 0 ? `   (+${more} more)` : ""}`,
    Box(
      { flexDirection: "row", flexGrow: 1, overflow: "hidden" },
      Box(
        { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
        ...visible.map((line) =>
          Text({
            content: line.display,
            attributes: line.isHeader ? TextAttributes.BOLD : TextAttributes.DIM,
          }),
        ),
      ),
      Scrollbar({
        display,
        total: state.lines.length,
        visible: PAGE,
        scrollTop: state.scroll,
        caps: true,
      }),
    ),
    Text({ content: " ↑/↓ scroll · esc close", attributes: TextAttributes.DIM }),
  );
}

function pickerRow(
  c: PickerCandidate,
  i: number,
  highlighted: boolean,
  display: ResolvedDisplay,
): ReturnType<typeof Text> {
  const rich = display.color === "truecolor" || display.color === "256";
  const cursor = highlighted ? ">" : " ";
  const chip = `[${i + 1}]`;
  const check = c.predicted ? (rich ? " ✓" : " *") : "  ";
  // Namespace fold puts the `policy:` prefix in dim + `spam` value in
  // default/accent. Mono falls back to a plain string render.
  if (!rich) {
    const line = ` ${cursor} ${chip}  ${c.label}${check}`;
    return Text({
      content: line,
      attributes: highlighted ? TextAttributes.BOLD : TextAttributes.DIM,
    });
  }
  const tone: Segment["tone"] = highlighted ? "accent" : "default";
  const segs: Segment[] = [
    { text: ` ${cursor} `, tone },
    { text: chip, tone: highlighted ? "accent" : "accentDeep" },
    { text: "  ", tone: "default" },
    ...foldNamespace(c.label, tone),
    { text: check, tone: c.predicted ? "success" : "dim" },
  ];
  return Text({
    content: segmentsToStyledText(segs, display),
    attributes: highlighted ? TextAttributes.BOLD : TextAttributes.NONE,
  });
}

function renderPicker(
  state: PickerState,
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
): ReturnType<typeof Box> {
  const rich = display.color === "truecolor" || display.color === "256";
  // Header carries the prediction context (plan G1):
  //   Relabel  ◇ predicted  →  ?
  // Reader sees what's being relabeled without having to look up at the
  // record card behind the modal. Mono fallback drops the diamond glyph.
  const predDiamond = rich ? "◇ " : "";
  const headerTitle = state.predicted
    ? `Relabel  ${predDiamond}${state.predicted}  →  ?`
    : "Relabel";

  return modalBox(
    display,
    termWidth,
    termHeight,
    0.5,
    headerTitle,
    Text({
      content: ` > ${state.filter}_`,
      attributes: TextAttributes.BOLD,
    }),
    Text({ content: "" }),
    ...state.candidates
      .slice(0, 9)
      .map((c: PickerCandidate, i) => pickerRow(c, i, i === state.highlight, display)),
    Text({ content: "" }),
    Text({
      content: " [1-9] pick · [enter] commit · [esc] cancel",
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
  // Multi-line text area, 8 rows tall (plan G2). Soft-cap counter at 500;
  // value can exceed but the counter colors warn past 500.
  const SOFT_CAP = 500;
  const VISIBLE_ROWS = 8;
  const lines = state.value.split("\n");
  // Show the last VISIBLE_ROWS lines so the cursor (always at end) stays
  // in view as the reviewer types.
  const sliceStart = Math.max(0, lines.length - VISIBLE_ROWS);
  const visible = lines.slice(sliceStart, sliceStart + VISIBLE_ROWS);
  while (visible.length < VISIBLE_ROWS) visible.push("");
  const len = state.value.length;
  const overSoftCap = len > SOFT_CAP;
  const counterText = `${len} / ${SOFT_CAP}`;

  // Static in-text caret. The earlier native-cursor approach (let the
  // terminal blink its own cursor placed at the input position) needed
  // geometric calculation of the modal's absolute screen coords, which
  // ended up brittle: OpenTUI's `position: absolute` resolves against
  // its flex parent rather than the terminal root, so the cursor landed
  // a few rows above the typed text. Reliable blink would require
  // switching the overlay to OpenTUI's native `EditBufferRenderable`
  // input widget — out of scope for this PR.
  const cursorGlyph = display.color === "truecolor" || display.color === "256" ? "▁" : "_";

  return modalBox(
    display,
    termWidth,
    termHeight,
    0.5,
    "Note",
    ...visible.map((line, idx) => {
      // Cursor sits on the row that holds the actual tail of the value
      // (`lines.length - 1`). Padding rows below stay blank. For an empty
      // note this still renders the cursor on the first visible row so
      // the user sees an input affordance.
      const cursorRowIdx = lines.length - 1 - sliceStart;
      const isPadding = sliceStart + idx >= lines.length;
      const content = idx === cursorRowIdx ? `${line}${cursorGlyph}` : isPadding ? "" : line;
      return Text({ content: ` ${content}` });
    }),
    Text({ content: "" }),
    Text({
      content: ` ${counterText}`,
      attributes: TextAttributes.DIM,
      fg:
        display.color === "truecolor" || display.color === "256"
          ? overSoftCap
            ? resolveTheme(display).fg.warning
            : resolveTheme(display).fg.dim
          : undefined,
    }),
    Text({
      content: " [enter] save · [shift+enter] newline · [esc] cancel",
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
