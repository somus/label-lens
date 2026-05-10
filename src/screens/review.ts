import type { CliRenderer } from "@opentui/core";
import { dispatch } from "../actions/dispatch.ts";
import { bindingsFor, type CommandRegistry, defaultRegistry } from "../actions/registry.ts";
import { type AppContext, enterReview } from "../app/context.ts";
import { labelName } from "../config/config.ts";
import { resolve } from "../keymap/engine.ts";
import { applyEffects } from "../overlay/effects.ts";
import { reduceOverlay } from "../overlay/reduce.ts";
import type { NoteState, Overlay, PickerCandidate, PickerState } from "../overlay/types.ts";
import { BandedRecord } from "../render/banded-record.ts";
import { Box } from "../render/box.ts";
import { pickLayout, type ResolvedDisplay } from "../render/capability.ts";
import { Text, TextAttributes } from "../render/text.ts";
import { progressCounts, recentReviews } from "../store/queries.ts";
import { type QueueId, resolveQueue } from "../store/queues/registry.ts";
import { hasTag } from "../store/tags.ts";
import type { RecordWithPrimaryPrediction, StoredReview } from "../types.ts";

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
  const bindings = bindingsFor([...registry.values()]);

  const renderState = () => {
    for (const child of renderer.root.getChildren()) child.destroyRecursively();
    const cursor = app.cursor;
    const queueId = app.queueId ?? initialQueueId;
    const counts = progressCounts(app.db);
    const reviewedTotal = counts.accepted + counts.relabeled + counts.rejected;
    const bandRows = Math.max(8, renderer.terminalHeight - NON_BAND_ROWS);
    const mode = pickLayout(app.display.layout, renderer.terminalWidth);
    const prevN = Math.max(MIN_WINDOW, Math.floor(bandRows * app.display.candidatePin));
    const nextN =
      mode === "split"
        ? 0
        : Math.max(MIN_WINDOW, Math.floor(bandRows * (1 - app.display.candidatePin)));
    const window = cursor?.window(prevN, nextN) ?? {
      records: [],
      focusedIndex: -1,
      startIndex: 0,
    };
    const record = cursor?.current() ?? null;
    const flash = app.flash && app.flash.expiresAt > Date.now() ? app.flash : null;
    const history = recentReviews(app.db, 5);
    const marked = record ? hasTag(app.db, record.id, "marked") : false;
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
            })
          : stackBody({
              window,
              record,
              labels: app.config.labels,
              history,
              display: app.display,
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
                content: ` a accept   r relabel   x reject   s skip   m ${marked ? "unmark" : "mark"}   n note   u undo   j next   k prev   [ prev queue   ] next queue   q quit`,
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
      applyEffects(app, queueId, result.effects);
      renderState();
      return;
    }
    const action = resolve(bindings, "review", {
      name: event.name,
      ctrl: event.ctrl,
      shift: event.shift,
      meta: event.meta,
    });
    if (!action) return;
    void dispatch(registry, "review", app, action);
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

type BodyArgs = {
  window: { records: RecordWithPrimaryPrediction[]; focusedIndex: number; startIndex: number };
  record: RecordWithPrimaryPrediction | null;
  labels: Parameters<typeof labelName>[0][];
  history: StoredReview[];
  display: ResolvedDisplay;
};

function stackBody(args: BodyArgs): ReturnType<typeof Box> {
  const { window, record, labels, history, display } = args;
  return Box(
    { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
    bandRegion(window.records, window.focusedIndex, window.startIndex, display),
    predictionLine(record),
    record ? labelListBox(labels, record.primaryPrediction?.label ?? null) : Box({}),
    noteLine(record),
    Box({ height: 1 }),
    historyLine(history),
  );
}

function splitBody(args: BodyArgs): ReturnType<typeof Box> {
  const { window, record, labels, history, display } = args;
  const before = window.records.slice(0, Math.max(0, window.focusedIndex));
  const focused = window.focusedIndex >= 0 ? (window.records[window.focusedIndex] ?? null) : null;
  const focusedAbsolute = window.startIndex + Math.max(0, window.focusedIndex);
  const pin = display.candidatePin;
  return Box(
    { flexDirection: "row", flexGrow: 1, overflow: "hidden" },
    // Left column: prev-context records hug the pin row from above.
    Box(
      { flexDirection: "column", flexBasis: 0, flexGrow: 1, overflow: "hidden" },
      Box(
        {
          flexDirection: "column",
          flexBasis: 0,
          flexGrow: pin,
          flexShrink: 0,
          overflow: "hidden",
          justifyContent: "flex-end",
        },
        ...before.map((r, i) =>
          BandedRecord({
            text: r.text,
            isFocused: false,
            bandSlot: slotFor(window.startIndex + i),
            display,
          }),
        ),
      ),
      Box({ flexBasis: 0, flexGrow: 1 - pin }),
    ),
    // Center column: focused record + focus box, viewport-pinned.
    Box(
      { flexDirection: "column", flexBasis: 0, flexGrow: 1, overflow: "hidden" },
      focused ? centerColumnFocused(focused, focusedAbsolute, display) : centerColumnEmpty(display),
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
        historyLine(history),
        predictionLine(record),
        record ? labelListBox(labels, record.primaryPrediction?.label ?? null) : Box({}),
        noteLine(record),
      ),
    ),
  );
}

function centerColumnFocused(
  focused: RecordWithPrimaryPrediction,
  focusedAbsolute: number,
  display: ResolvedDisplay,
): ReturnType<typeof Box> {
  const pin = display.candidatePin;
  return Box(
    { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
    Box({
      flexDirection: "column",
      flexBasis: 0,
      flexGrow: pin,
      flexShrink: 0,
      overflow: "hidden",
    }),
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
    ),
  );
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

function historyLine(
  history: StoredReview[],
  opts: { marginTop?: number } = {},
): ReturnType<typeof Box> {
  if (history.length === 0) return Box({});
  return Box(
    { flexDirection: "row", marginTop: opts.marginTop ?? 0 },
    Text({
      content: ` history: ${formatHistory(history)}`,
      attributes: TextAttributes.DIM,
    }),
  );
}

function centerColumnEmpty(display: ResolvedDisplay): ReturnType<typeof Box> {
  const pin = display.candidatePin;
  return Box(
    { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
    Box({
      flexDirection: "column",
      flexBasis: 0,
      flexGrow: pin,
      flexShrink: 0,
      overflow: "hidden",
    }),
    Box(
      {
        flexDirection: "column",
        flexBasis: 0,
        flexGrow: 1 - pin,
        flexShrink: 1,
        overflow: "hidden",
        padding: 2,
      },
      Text({
        content: "All records reviewed. Press q to quit.",
        attributes: TextAttributes.DIM,
      }),
    ),
  );
}

function bandRegion(
  records: RecordWithPrimaryPrediction[],
  focusedIndex: number,
  startIndex: number,
  display: ResolvedDisplay,
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

  const before = records.slice(0, focusedIndex);
  const focused = records[focusedIndex]!;
  const after = records.slice(focusedIndex + 1);
  const pin = display.candidatePin;
  const focusedAbsolute = startIndex + focusedIndex;

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
      ...before.map((r, i) =>
        BandedRecord({
          text: r.text,
          isFocused: false,
          bandSlot: slotFor(startIndex + i),
          display,
        }),
      ),
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
      ...after.map((r, i) =>
        BandedRecord({
          text: r.text,
          isFocused: false,
          bandSlot: slotFor(focusedAbsolute + 1 + i),
          display,
        }),
      ),
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
  }
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

function formatHistory(history: StoredReview[]): string {
  return history
    .map((h) => {
      const sym = STATUS_SYMBOL[h.status] ?? "?";
      const lbl = h.final_label ?? h.prev_label ?? "";
      return `${shortId(h.record_id)} ${sym} ${lbl}`;
    })
    .join("  ·  ");
}

function shortId(id: string): string {
  return id.slice(0, 6);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}
