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
import type { PaletteState } from "../overlay/palette.ts";
import { reduceOverlay } from "../overlay/reduce.ts";
import type { NoteState, Overlay, PickerCandidate, PickerState } from "../overlay/types.ts";
import { BandedRecord } from "../render/banded-record.ts";
import { Box } from "../render/box.ts";
import { pickLayout, type ResolvedDisplay } from "../render/capability.ts";
import { splitContextLines } from "../render/context-strip.ts";
import { Markdown } from "../render/markdown.ts";
import { Text, TextAttributes } from "../render/text.ts";
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

const STATUS_SYMBOL: Record<StoredReview["status"], string> = {
  accepted: "+",
  relabeled: "~",
  rejected: "-",
  skipped: ">",
  undone: "<",
  pending: "?",
};

const NON_BAND_ROWS = 14;
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

  const chord = createChordResolver(bindings);
  const dispatchCommand = (name: string, argument?: string): Promise<void> =>
    dispatch(registry, app.activeScope ?? "review", app, name, argument).then(() => undefined);
  let lastDocViewActive = false;
  let lastOverlayActive = false;

  const renderState = () => {
    for (const child of renderer.root.getChildren()) child.destroyRecursively();
    const docViewActive = app.docView !== null;
    const overlayActive = app.overlay !== null;
    if (docViewActive !== lastDocViewActive || overlayActive !== lastOverlayActive) {
      chord.reset();
      lastDocViewActive = docViewActive;
      lastOverlayActive = overlayActive;
    }
    if (app.docView) {
      renderer.root.add(renderDocView(app, renderer.terminalHeight));
      return;
    }
    const cursor = app.cursor;
    const queueId = app.queueId ?? initialQueueId;
    const counts = progressCounts(app.db);
    const reviewedTotal = counts.accepted + counts.relabeled + counts.rejected;
    const bandRows = Math.max(8, renderer.terminalHeight - NON_BAND_ROWS);
    const mode = pickLayout(app.display.layout, renderer.terminalWidth);
    const prevN = Math.max(MIN_WINDOW, Math.floor(bandRows * app.display.candidatePin));
    const nextN = Math.max(MIN_WINDOW, Math.floor(bandRows * (1 - app.display.candidatePin)));
    const window = cursor?.window(prevN, nextN) ?? {
      records: [],
      focusedIndex: -1,
      startIndex: 0,
    };
    const record = cursor?.current() ?? null;
    const flash = app.flash && app.flash.expiresAt > Date.now() ? app.flash : null;
    const history = recentReviewsWithText(app.db, 5);
    const marked = record ? hasTag(app.db, record.id, "marked") : false;
    const issues = record ? issuesForRecord(app.db, record.id) : [];
    const predictionCount = record ? countPredictions(app.db, record.id) : 0;
    const queueLabel = resolveQueue(queueId).label;
    const queueTotal = cursor?.total ?? 0;
    const queuePosition = queueTotal === 0 ? 0 : (cursor?.position ?? 0) + 1;
    const queueIndicator = queueTotal === 0 ? "0 / 0" : `${queuePosition} / ${queueTotal}`;

    renderer.root.add(
      Box(
        { flexDirection: "column", flexGrow: 1, padding: 1 },

        Box(
          { flexDirection: "row", justifyContent: "space-between" },
          Text({
            content: ` LabelLens · ${basename(app.config.input.path)} · ${queueLabel} · ${queueIndicator}${marked ? "   ● marked" : ""}`,
            attributes: marked ? TextAttributes.BOLD : undefined,
          }),
          Text({
            content: `Reviewed: ${reviewedTotal} / ${counts.total} · Skipped: ${counts.skipped} · Pending: ${counts.pending}`,
            attributes: TextAttributes.DIM,
          }),
        ),

        Box({ height: 1 }),

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
            }),

        app.overlay ? renderOverlay(app.overlay) : Box({}),

        flash
          ? Box(
              { flexDirection: "row" },
              Text({
                content: ` ! ${flash.message}`,
                attributes: TextAttributes.BOLD,
              }),
            )
          : Box(
              { flexDirection: "row" },
              Text({
                content: ` a accept · r relabel · x reject · s skip · m ${marked ? "unmark" : "mark"} · n note · u undo · j/k next/prev${app.config.task === "boundary" ? " · gd doc" : ""} · [/] queue · : cmd · ? help · gg guide · q quit`,
                attributes: TextAttributes.DIM,
              }),
            ),
      ),
    );
  };

  app.requestRender = renderState;

  const onKey = (event: { name: string; ctrl: boolean; shift: boolean; meta: boolean }) => {
    if (app.overlay) {
      const result = reduceOverlay(app.overlay, { kind: "key", event });
      app.overlay = result.overlay;
      const queueId = app.queueId ?? initialQueueId;
      applyEffects(app, queueId, result.effects, dispatchCommand);
      renderState();
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
  } = args;
  return Box(
    { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
    bandRegion(window.records, window.focusedIndex, window.startIndex, display, contextStrip),
    predictionLine(record),
    issueBadges(issues, totalRecords, predictionCount),
    record ? labelListBox(labels, record.primaryPrediction?.label ?? null) : Box({}),
    noteLine(record),
    Box({ height: 1 }),
    historyBlock(history),
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
  } = args;
  const pin = display.candidatePin;
  return Box(
    { flexDirection: "row", flexGrow: 1, overflow: "hidden" },
    // Main column: full band region (prev above, focused pinned, after below).
    Box(
      { flexDirection: "column", flexBasis: 0, flexGrow: 2, overflow: "hidden" },
      bandRegion(window.records, window.focusedIndex, window.startIndex, display, contextStrip),
    ),
    // Right column: history + metadata + label list, top-aligned to the pin row.
    Box(
      { flexDirection: "column", flexBasis: 0, flexGrow: 1, overflow: "hidden" },
      Box({ flexBasis: 0, flexGrow: pin }),
      Box(
        {
          flexDirection: "column",
          flexBasis: 0,
          flexGrow: 1 - pin,
          flexShrink: 1,
          overflow: "hidden",
        },
        historyBlock(history),
        predictionLine(record),
        issueBadges(issues, totalRecords, predictionCount),
        record ? labelListBox(labels, record.primaryPrediction?.label ?? null) : Box({}),
        noteLine(record),
      ),
    ),
  );
}

function issueBadges(
  issues: StoredIssue[],
  totalRecords: number,
  predictionCount: number,
): ReturnType<typeof Box> {
  if (issues.length === 0) return Box({});
  // Stable order so snapshots are deterministic regardless of insert order.
  const sorted = [...issues].sort((a, b) => a.type.localeCompare(b.type));
  return Box(
    { flexDirection: "column", marginTop: 1 },
    ...sorted.map((i) =>
      Text({
        content: ` ! ${badgeCopy(i, totalRecords, predictionCount)}`,
        attributes: TextAttributes.DIM,
      }),
    ),
  );
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

function predictionLine(record: RecordWithPrimaryPrediction | null): ReturnType<typeof Box> {
  if (!record?.primaryPrediction) return Box({});
  const p = record.primaryPrediction;
  const conf = p.confidence !== null ? `  (${Math.round(p.confidence * 100)}%)` : "";
  return Box(
    { flexDirection: "row", marginTop: 1 },
    Text({
      content: ` src ${p.source}   →   ${p.label}${conf}`,
      attributes: TextAttributes.DIM,
    }),
  );
}

function noteLine(record: RecordWithPrimaryPrediction | null): ReturnType<typeof Box> {
  if (!record?.note) return Box({});
  return Box(
    { flexDirection: "row", marginTop: 1 },
    Text({
      content: ` note: ${truncate(record.note, 200)}${record.note.length > 200 ? " (press n for full)" : ""}`,
      attributes: TextAttributes.DIM,
    }),
  );
}

function historyBlock(history: HistoryEntry[]): ReturnType<typeof Box> {
  if (history.length === 0) return Box({});
  return Box(
    { flexDirection: "column" },
    Text({ content: " history:", attributes: TextAttributes.DIM }),
    ...history.map((h) =>
      Text({
        content: ` ${STATUS_SYMBOL[h.status] ?? "?"} ${labelOrDash(h.final_label ?? h.prev_label)}  ${truncate(h.recordText, 32)}`,
        attributes: TextAttributes.DIM,
      }),
    ),
  );
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
  const pin = display.candidatePin;
  const focusedAbsolute = startIndex + focusedIndex;

  const beforeChildren = contextStrip
    ? contextStrip.before.map((line, i) =>
        BandedRecord({
          text: line,
          isFocused: false,
          bandSlot: slotFor(i),
          display,
          variant: "context",
        }),
      )
    : records.slice(0, focusedIndex).map((r, i) =>
        BandedRecord({
          text: r.text,
          isFocused: false,
          bandSlot: slotFor(startIndex + i),
          display,
        }),
      );

  const afterChildren = contextStrip
    ? contextStrip.after.map((line, i) =>
        BandedRecord({
          text: line,
          isFocused: false,
          bandSlot: slotFor(i),
          display,
          variant: "context",
        }),
      )
    : records.slice(focusedIndex + 1).map((r, i) =>
        BandedRecord({
          text: r.text,
          isFocused: false,
          bandSlot: slotFor(focusedAbsolute + 1 + i),
          display,
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

function labelListBox(
  labels: Parameters<typeof labelName>[0][],
  predicted: string | null,
): ReturnType<typeof Box> {
  return Box(
    { flexDirection: "column", marginTop: 1 },
    ...labels.slice(0, 9).map((entry, idx) => {
      const name = labelName(entry);
      const isPredicted = name === predicted;
      const marker = isPredicted ? " >" : "  ";
      return Text({
        content: ` ${idx + 1} ${name}${marker}`,
        attributes: isPredicted ? TextAttributes.BOLD : TextAttributes.DIM,
      });
    }),
  );
}

function renderOverlay(overlay: Overlay): ReturnType<typeof Box> {
  switch (overlay.kind) {
    case "picker":
      return renderPicker(overlay.state);
    case "note":
      return renderNote(overlay.state);
    case "assistant":
      return Box(
        { flexDirection: "column", borderStyle: "rounded", padding: 1, marginTop: 1 },
        Text({ content: " assistant overlay (slice 11)" }),
      );
    case "palette":
      return renderPalette(overlay.state);
    case "help":
      return renderHelp(overlay.state);
    case "guidelines":
      return renderGuidelines(overlay.state);
  }
}

function renderGuidelines(state: GuidelinesState): ReturnType<typeof Box> {
  // Slice the markdown source by line so the reducer's scroll counter
  // actually drives what the user sees. MarkdownRenderable doesn't expose
  // a viewport; line-slice keeps it simple and matches the up/down=1,
  // pgup/pgdn=10 model.
  const lines = state.content.split("\n");
  const total = lines.length;
  const start = Math.min(state.scroll, Math.max(total - 1, 0));
  const sliced = lines.slice(start).join("\n");
  const moreAbove = start > 0;
  const titleSuffix = total > 1 ? `   line ${start + 1}/${total}` : "";
  return Box(
    {
      flexDirection: "column",
      borderStyle: "rounded",
      padding: 1,
      marginTop: 1,
      flexGrow: 1,
    },
    Text({ content: ` ${state.title}${titleSuffix}${moreAbove ? "   ↑ above" : ""}` }),
    Markdown({ content: sliced }),
    Text({
      content: " ↑/↓ scroll · pgup/pgdn page · esc close",
      attributes: TextAttributes.DIM,
    }),
  );
}

function renderHelp(state: HelpState): ReturnType<typeof Box> {
  const visible = state.entries.slice(state.scroll, state.scroll + HELP_PAGE);
  const more = state.entries.length - state.scroll - visible.length;
  return Box(
    { flexDirection: "column", borderStyle: "rounded", padding: 1, marginTop: 1 },
    Text({
      content: ` help · ${state.scope} · ${state.entries.length} commands${more > 0 ? `   (+${more} more, ↓ to scroll)` : ""}`,
    }),
    ...visible.map((e) =>
      Text({
        content: ` ${e.binding.padEnd(10)} ${e.name}${e.palette ? `   ${e.palette}` : ""}`,
        attributes: TextAttributes.DIM,
      }),
    ),
    Text({ content: " ↑/↓ scroll · esc close", attributes: TextAttributes.DIM }),
  );
}

function renderPalette(state: PaletteState): ReturnType<typeof Box> {
  return Box(
    { flexDirection: "column", borderStyle: "rounded", padding: 1, marginTop: 1 },
    Text({ content: ` :${state.filter}_` }),
    ...state.entries.slice(0, 12).map((e, i) =>
      Text({
        content: ` ${e.palette}${i === state.highlight ? "  <-" : ""}`,
        attributes: i === state.highlight ? TextAttributes.BOLD : TextAttributes.DIM,
      }),
    ),
    Text({
      content: " enter run · ↑/↓ navigate · ctrl+p/n history · esc cancel",
      attributes: TextAttributes.DIM,
    }),
  );
}

function renderPicker(state: PickerState): ReturnType<typeof Box> {
  return Box(
    { flexDirection: "column", borderStyle: "rounded", padding: 1, marginTop: 1 },
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

function renderNote(state: NoteState): ReturnType<typeof Box> {
  return Box(
    { flexDirection: "column", borderStyle: "rounded", padding: 1, marginTop: 1 },
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
