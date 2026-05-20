import type { CliRenderer } from "@opentui/core";
import { dispatch } from "../actions/dispatch.ts";
import { bindingsFor, type CommandRegistry, defaultRegistry } from "../actions/registry.ts";
import { type AppContext, enterReview } from "../app/context.ts";
import { ASSISTANT_PRIVACY_NOTICE } from "../assistant/privacy_notice.ts";
import { createChordResolver } from "../keymap/chord.ts";
import type { Scope } from "../keymap/engine.ts";
import { CONFIGURE_PROVIDERS, envVarFor } from "../overlay/configure-assistant.ts";
import { applyEffects } from "../overlay/effects.ts";
import { GUIDELINES_PAGE, type GuidelinesState } from "../overlay/guidelines.ts";
import { HELP_PAGE, type HelpState } from "../overlay/help.ts";
import { flashFooterHint, overlayFooterHint } from "../overlay/hints.ts";
import type { QueueState } from "../overlay/queue.ts";
import { reduceOverlay } from "../overlay/reduce.ts";
import { withStatsPageSize } from "../overlay/stats-overlay.ts";
import type {
  AssistantState,
  BulkConfirmState,
  ConfigureAssistantState,
  NoteState,
  Overlay,
  PickerCandidate,
  PickerState,
} from "../overlay/types.ts";
import { fadeIn, pulse } from "../render/anim.ts";
import { Box } from "../render/box.ts";
import {
  pickQueuePreview,
  pickSidebar,
  queuePreviewWidth,
  type ResolvedDisplay,
  sidebarWidth,
} from "../render/capability.ts";
import { Chrome, type Segment } from "../render/chrome/index.ts";
import type { QueuePreviewRow } from "../render/chrome/queue-preview.ts";
import { segmentsToStyledText } from "../render/chrome/status-bar.ts";
import { splitContextLines } from "../render/context-strip.ts";
import type { PasteEvent } from "../render/events.ts";
import { renderFilterBuilder } from "../render/filter-view.ts";
import { labelChipText } from "../render/label-chip.ts";
import { foldNamespace } from "../render/label-fold.ts";
import { Markdown } from "../render/markdown.ts";
import { ModalHeader } from "../render/modal-frame.ts";
import { renderPalette as renderPaletteV2 } from "../render/palette-view.ts";
import { progressSegments } from "../render/progress-segments.ts";
import { sanitizeStatusText } from "../render/sanitize.ts";
import { Scrollbar } from "../render/scrollbar.ts";
import { clampContentWidth, SectionHeader } from "../render/section-header.ts";
import { renderStatsOverlay, statsVisibleRows } from "../render/stats-view.ts";
import { Text, TextAttributes } from "../render/text.ts";
import { borderForRole, resolveTheme } from "../render/theme.ts";
import { issuesForRecord } from "../store/issues.ts";
import { predictionsForRecord, progressCounts, recentReviewsWithText } from "../store/queries.ts";
import { type QueueId, resolveQueue } from "../store/queues/registry.ts";
import { hasTag } from "../store/tags.ts";
import type { RecordWithPrimaryPrediction } from "../types.ts";
import { renderDocView } from "./doc-view.ts";
import { HistoryStrip } from "./review/regions/history-strip.ts";
import { QueueHeader } from "./review/regions/queue-header.ts";
import { Signals } from "./review/regions/signals.ts";
import { type BoundaryRowMeta, type ContextStrip, Subject } from "./review/regions/subject.ts";
import { resolveTaskRenderer } from "./review/tasks/index.ts";

export type ReviewScreenHandle = {
  destroy: () => void;
};

/**
 * How many neighbouring records to fetch for the queue-preview left rail
 * (when visible at ≥200 cols). 6 rows total around the cursor — plenty
 * for "what's coming up" without dominating the rail.
 */
const QUEUE_PREVIEW_WINDOW = 6;

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
  // Track assistant strip visibility across renders so the fade-in plays once
  // when it first appears (not on every keystroke while the overlay is open).
  let lastAssistantVisible = false;

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
    const taskRenderer = resolveTaskRenderer(app.config);
    const window = cursor?.window(
      taskRenderer.contextRowsBefore,
      taskRenderer.contextRowsAfter,
    ) ?? {
      records: [],
      focusedIndex: -1,
      startIndex: 0,
    };
    const record = cursor?.current() ?? null;
    const history = recentReviewsWithText(app.db, 5);
    const marked = record ? hasTag(app.db, record.id, "marked") : false;
    const issues = record ? issuesForRecord(app.db, record.id) : [];
    const predictions = record ? predictionsForRecord(app.db, record.id) : [];
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

    const sidebarVisible = pickSidebar(app.display, renderer.terminalWidth);
    const previewVisible = sidebarVisible && pickQueuePreview(app.display, renderer.terminalWidth);

    // Main-column content width — used to cap section headers + focused
    // record bg so every row stops at the same column regardless of how
    // wide the terminal is. Reserve the chrome's outer padding (2),
    // sidebar + gap (when visible), and queue-preview + gap (when
    // visible) so the cap reflects actual room in the main column.
    const chromePad = 2;
    const sidebarUsed = sidebarVisible ? sidebarWidth(renderer.terminalWidth) + 1 : 0;
    const previewUsed = previewVisible ? queuePreviewWidth() + 1 : 0;
    const mainColWidth = Math.max(
      40,
      renderer.terminalWidth - chromePad - sidebarUsed - previewUsed,
    );
    const contentWidth = clampContentWidth(mainColWidth);

    const subject = Subject({
      window,
      display: app.display,
      contextStrip: contextStripFor(app, record),
      boundary: boundaryRowMetaFor(app.config, app.display),
      contextIntensity: taskRenderer.contextIntensity,
      slotsBefore: taskRenderer.contextRowsBefore,
      slotsAfter: taskRenderer.contextRowsAfter,
      contentWidth,
    });
    const signals = Signals({
      record,
      predictions,
      issues,
      display: app.display,
      totalRecords: counts.total,
      marked,
      contentWidth,
    });
    const decision = taskRenderer.renderDecision({
      record,
      labels: app.config.labels,
      display: app.display,
      contentWidth,
    });
    const historyStrip = sidebarVisible
      ? Box({})
      : HistoryStrip({
          history: history.map((h) => ({
            status: h.status,
            label: h.final_label ?? h.prev_label,
            recordText: h.recordText,
          })),
          display: app.display,
        });

    // Cluster-at-top: queue header + subject + signals + decision hug
    // each other at the top of the main column. The spacer below
    // absorbs leftover height so any whitespace lands beneath the work
    // cluster rather than between its rows. History-strip (sidebar-off
    // fallback) pins to the bottom alongside the action footer.
    const queueHeader = QueueHeader({
      display: app.display,
      queueLabel,
      position: queuePosition,
      total: queueTotal,
      contentWidth,
    });
    // Inline assistant strip slots right below the chip rail (decision)
    // when the overlay is active — keeps suggestion + label set in the same
    // eye-line per the inline-footer design (ADR 0009).
    const assistantVisible = app.overlay?.kind === "assistant";
    if (assistantVisible !== lastAssistantVisible) {
      const becameVisible = assistantVisible;
      lastAssistantVisible = assistantVisible;
      // Fade-in plays once on appearance; the motion controller is a no-op at
      // mono / 16-color (display.motion=false) so this respects the config
      // override automatically.
      if (becameVisible) app.motion.play("assistant.strip.appear", fadeIn(220));
    }
    const assistantStrip = assistantVisible
      ? renderAssistantStrip(
          (app.overlay as { kind: "assistant"; state: AssistantState }).state,
          app.display,
          contentWidth,
          app.motion.snapshot("assistant.strip.appear"),
        )
      : Box({});
    const body = Box(
      { flexDirection: "column", flexGrow: 1, overflow: "hidden" },
      queueHeader,
      Text({ content: " " }),
      subject,
      signals,
      decision,
      assistantStrip,
      Box({ flexGrow: 1, flexShrink: 1 }),
      historyStrip,
    );

    const flashActive = !app.overlay && flash !== null;
    // Assistant + note overlays keep the registry-derived footer so the
    // reviewer still sees accept/reject/relabel under them — the commit
    // shortcuts stay live while the overlay is open.
    const overlayWantsCustomHint =
      app.overlay !== null && app.overlay.kind !== "assistant" && app.overlay.kind !== "note";
    const footerHint = overlayWantsCustomHint
      ? overlayFooterHint(app.overlay!, app.keyPreset)
      : app.overlay
        ? undefined
        : flashFooterHint(flash, app.display, flashActive);

    // Skip the per-frame sidebar snapshot when the sidebar is hidden.
    // `getSidebarData` queries the DB (signal counts, queue progress) +
    // pulls cursor.recordIds() — wasted work on every keystroke when the
    // chrome path won't render the sidebar anyway. Keystroke perf regressed
    // from ~19ms → ~80ms on the 10K-record medium fixture before this skip.
    const queuePreview = previewVisible ? buildQueuePreview(cursor) : undefined;
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
        sidebar: sidebarVisible ? app.getSidebarData("queue") : undefined,
        queuePreview,
        body,
      }),
    );
    // Overlay mounts at the root level (added after Chrome so it paints
    // on top) and centers against the full terminal — no clipping by
    // sidebar / queue-preview rails since it's not inside the main column.
    if (app.overlay) {
      renderer.root.add(
        renderOverlay(app.overlay, app, renderer.terminalWidth, renderer.terminalHeight),
      );
    }
  };

  app.requestRender = renderState;

  const dispatchKey = (
    event: { name: string; ctrl: boolean; shift: boolean; meta: boolean },
    scopeOverride?: Scope,
  ) => {
    const scope = scopeOverride ?? (app.docView ? "doc-view" : "review");
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

  const dispatchPropagatedKey = (
    event: { name: string; ctrl: boolean; shift: boolean; meta: boolean },
    contextScope: Scope,
  ) => {
    app.activeScope = contextScope;
    const action = chord.feed("global", {
      name: event.name,
      ctrl: event.ctrl,
      shift: event.shift,
      meta: event.meta,
    });
    if (!action) return;
    void dispatch(registry, contextScope, app, action);
  };

  const onKey = (event: { name: string; ctrl: boolean; shift: boolean; meta: boolean }) => {
    app.noteInput();
    if (app.overlay) {
      const sourceOverlay = app.overlay;
      const result = reduceOverlay(
        normalizeOverlayForTerminal(sourceOverlay, renderer.terminalHeight),
        {
          kind: "key",
          event,
          preset: app.keyPreset,
        },
      );
      app.overlay = result.overlay;
      const queueId = app.queueId ?? initialQueueId;
      applyEffects(app, queueId, result.effects, dispatchCommand);
      if (result.propagated) {
        dispatchPropagatedKey(event, propagatedScope(sourceOverlay, app));
      } else if (mounted) {
        renderState();
      }
      return;
    }
    dispatchKey(event);
  };

  /**
   * Bracketed paste from terminals arrives as one `paste` event with the
   * full clipboard payload. Without this handler the bytes vanish (or worse,
   * the leading ESC of the bracket marker triggers the overlay's escape
   * branch and closes the configure / note prompt mid-paste). Type matches
   * OpenTUI's `PasteEvent` (KeyHandlerEventMap['paste']).
   */
  const onPaste = (event: PasteEvent) => {
    if (!app.overlay) return;
    const text = new TextDecoder().decode(event.bytes);
    const result = reduceOverlay(app.overlay, { kind: "paste", text });
    app.overlay = result.overlay;
    const queueId = app.queueId ?? initialQueueId;
    applyEffects(app, queueId, result.effects, dispatchCommand);
    if (mounted) renderState();
  };

  const onResize = () => renderState();

  renderer.keyInput.on("keypress", onKey);
  renderer.keyInput.on("paste", onPaste);
  renderer.on("resize", onResize);
  renderState();

  return {
    destroy: () => {
      mounted = false;
      renderer.keyInput.off("keypress", onKey);
      renderer.keyInput.off("paste", onPaste);
      renderer.off("resize", onResize);
    },
  };
}

function normalizeOverlayForTerminal(overlay: Overlay, termHeight: number): Overlay {
  if (overlay.kind !== "stats") return overlay;
  return {
    kind: "stats",
    state: withStatsPageSize(
      overlay.state,
      statsVisibleRows(overlay.state.summary.length, termHeight),
    ),
  };
}

function propagatedScope(overlay: Overlay, app: AppContext): Scope {
  if (overlay.kind === "stats") return "stats";
  if (overlay.kind === "queue") return "queue";
  if (overlay.kind === "help") return overlay.state.scope;
  return app.docView ? "doc-view" : "review";
}

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

/**
 * Build the queue-preview rail payload from the current cursor.
 * `QUEUE_PREVIEW_WINDOW` rows before and after the cursor (capped by
 * queue size); the focused index is computed from the slice.
 */
function buildQueuePreview(cursor: import("../cursor/cursor.ts").Cursor | null): {
  rows: QueuePreviewRow[];
  focusedIndex: number;
} {
  if (!cursor || cursor.total === 0) return { rows: [], focusedIndex: -1 };
  const window = cursor.window(QUEUE_PREVIEW_WINDOW, QUEUE_PREVIEW_WINDOW);
  return {
    rows: window.records.map((r) => ({
      id: r.id,
      label: r.primaryPrediction?.label ?? null,
      confidence: r.primaryPrediction?.confidence ?? null,
    })),
    focusedIndex: window.focusedIndex,
  };
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
      // Assistant overlay renders inline (below the chip rail) via
      // renderAssistantStrip in the main body, not as a modal stack. Return
      // an empty box so the overlay layer doesn't double-render.
      return Box({});
    case "configure-assistant":
      return renderConfigureAssistant(overlay.state, display, termWidth, termHeight);
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
    case "bulk-confirm":
      return renderBulkConfirm(overlay.state, display, termWidth, termHeight);
  }
}

/**
 * Inline assistant section (PRD §14.4 superseded by ADR 0009). Matches the
 * chrome of `prediction` / `labels` — SectionHeader + indented body rows —
 * so the strip reads as another section rather than a floating modal.
 * Collapsed: one summary line. Expanded (`Tab`): markdown reasoning above
 * the summary row.
 */
function renderAssistantStrip(
  state: AssistantState,
  display: ResolvedDisplay,
  contentWidth: number,
  fadeSnapshot?: import("../render/anim.ts").MotionSnapshot,
): ReturnType<typeof Box> {
  const reason = state.status === "done" ? state.reason : null;
  const expanded = state.reasoningExpanded && reason !== null;
  const segs = buildAssistantSegments(state);
  const trailing = buildAssistantStatusTrailing(state);
  // During fade-in (motion progress < 1) drop BOLD on the summary line so the
  // strip visibly settles in rather than snapping to full weight. At mono /
  // 16-color the motion controller stays inactive so this is a no-op.
  const fadingIn = (fadeSnapshot?.active ?? false) && (fadeSnapshot?.progress ?? 1) < 1;

  const children: ReturnType<typeof Text | typeof Box>[] = [];
  children.push(SectionHeader({ display, label: "assistant", width: contentWidth, trailing }));
  children.push(Text({ content: " " }));

  if (expanded && reason) {
    // Constrain reasoning to the same content width as the section header
    // — otherwise the markdown wraps to the full terminal width on wide
    // displays and looks unmoored from the `assistant ─────` rule above.
    children.push(
      Box(
        { flexDirection: "column", flexShrink: 0, marginBottom: 1, width: contentWidth },
        Markdown({ content: reason }),
      ),
    );
  }

  children.push(
    Box(
      { flexDirection: "column", flexShrink: 0, width: contentWidth },
      Text({
        content: segmentsToStyledText(segs, display),
        attributes: fadingIn ? TextAttributes.DIM : TextAttributes.BOLD,
        wrapMode: "word",
      }),
    ),
  );

  return Box({ flexDirection: "column", marginTop: 1, flexShrink: 0 }, ...children);
}

function buildAssistantSegments(state: AssistantState): Segment[] {
  if (state.status === "loading") {
    return [
      { text: " LLM ", tone: "accent" },
      { text: "thinking…", tone: "muted" },
      { text: "   ", tone: "default" },
      { text: "[esc]", tone: "accent" },
      { text: " cancel", tone: "muted" },
    ];
  }
  if (state.status === "streaming") {
    return [
      { text: " LLM ", tone: "accent" },
      { text: truncate(state.buffer, 60), tone: "muted" },
    ];
  }
  if (state.status === "error") {
    return [
      { text: " ✗ ", tone: "danger" },
      { text: state.errorMessage ?? "unknown error", tone: "muted" },
      { text: "   ", tone: "default" },
      { text: "[esc]", tone: "accent" },
      { text: " dismiss", tone: "muted" },
    ];
  }
  // done — narrowed by the early returns above
  const hasReason = state.reason.trim().length > 0;
  const segs: Segment[] = [
    { text: " ◆", tone: "accent" },
    { text: " ", tone: "default" },
    { text: state.recommendedAction, tone: "default" },
    { text: " → ", tone: "muted" },
    { text: state.suggestion, tone: "accent" },
    { text: "  ", tone: "default" },
    { text: state.confidence, tone: "muted" },
    { text: "   ", tone: "default" },
  ];
  // Suppress the Tab hint when the assistant returned empty reasoning —
  // pressing Tab would otherwise toggle a blank panel.
  if (hasReason) {
    segs.push({ text: "[tab]", tone: "accent" }, { text: " reasoning · ", tone: "muted" });
  }
  segs.push(
    { text: "[enter]", tone: "accent" },
    { text: " commit · ", tone: "muted" },
    { text: "[esc]", tone: "accent" },
    { text: " dismiss", tone: "muted" },
  );
  return segs;
}

function buildAssistantStatusTrailing(state: AssistantState): Segment[] | undefined {
  if (state.status === "loading") return [{ text: "loading…", tone: "muted" }];
  if (state.status === "streaming") return [{ text: "streaming", tone: "muted" }];
  if (state.status === "error") return [{ text: "error", tone: "danger" }];
  return [{ text: "ready", tone: "muted" }];
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function renderConfigureAssistant(
  state: ConfigureAssistantState,
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
): ReturnType<typeof Box> {
  switch (state.step) {
    case "provider": {
      const lines = CONFIGURE_PROVIDERS.map(
        (p, i) => `  [${i + 1}] ${p.slug === state.selectedProvider ? "▸ " : "  "}${p.label}`,
      );
      const body: ReturnType<typeof Text>[] = [
        Text({ content: "Pick an assistant provider:" }),
        Text({ content: "" }),
        ...lines.map((l) => Text({ content: l })),
        Text({ content: "" }),
        Text({
          content: state.error
            ? ` ! ${state.error}`
            : " Press 1-9 to select, [enter] continue, [esc] cancel",
          attributes: state.error ? TextAttributes.BOLD : TextAttributes.DIM,
        }),
      ];
      return modalBox(display, termWidth, termHeight, 0.5, "Configure Assistant", ...body);
    }
    case "auth": {
      const local = state.selectedProvider === "ollama";
      const value = local ? (state.ollamaUrl ?? "") : (state.apiKey ?? "");
      const fieldLabel = local ? "Ollama URL" : "API key";
      const mask = local ? value : "*".repeat(value.length);
      const envVar = state.selectedProvider ? envVarFor(state.selectedProvider) : "";
      const body: ReturnType<typeof Text>[] = [
        Text({ content: `Provider: ${state.selectedProvider}` }),
        Text({ content: "" }),
        Text({ content: `${fieldLabel}:` }),
        Text({ content: ` > ${mask}_`, attributes: TextAttributes.BOLD }),
        Text({ content: "" }),
      ];
      if (local) {
        // Reassure the reviewer up-front: Ollama runs locally and the next
        // step skips the remote-call privacy notice entirely.
        body.push(
          Text({
            content: " This model runs locally; no data leaves your machine.",
            attributes: TextAttributes.DIM,
          }),
          Text({ content: "" }),
        );
      } else {
        body.push(
          Text({
            content: ` Key is session-only. Export ${envVar} in your shell for next launch.`,
            attributes: TextAttributes.DIM,
          }),
          Text({ content: "" }),
        );
      }
      body.push(
        Text({
          content: state.error
            ? ` ! ${state.error}`
            : ` Type ${local ? "URL" : "key"} (paste OK), [enter] continue, [esc] cancel`,
          attributes: state.error ? TextAttributes.BOLD : TextAttributes.DIM,
        }),
      );
      return modalBox(display, termWidth, termHeight, 0.5, "Configure Assistant", ...body);
    }
    case "privacy": {
      const body: ReturnType<typeof Text>[] = [
        Text({ content: "Privacy notice (please read):", attributes: TextAttributes.BOLD }),
        Text({ content: "" }),
        Text({ content: ASSISTANT_PRIVACY_NOTICE, wrapMode: "word" }),
        Text({ content: "" }),
        Text({
          content: " [y] accept and finish · [n] cancel",
          attributes: TextAttributes.DIM,
        }),
      ];
      return modalBox(display, termWidth, termHeight, 0.6, "Configure Assistant", ...body);
    }
    case "commit":
      return modalBox(
        display,
        termWidth,
        termHeight,
        0.4,
        "Configure Assistant",
        Text({ content: " Saving config…" }),
      );
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
  // Scrollbar visible window scales with modal height so the thumb is
  // proportional on tall terminals instead of pinned to GUIDELINES_PAGE
  // (10) which made the bar look wedged near the top on 60+ row screens.
  const modalHeight = Math.max(12, termHeight - Math.floor(termHeight * 0.12) * 2 - 2);
  const visiblePage = Math.max(GUIDELINES_PAGE, modalHeight - 6);
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
        visible: visiblePage,
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
  // Dynamic page = modal inner height (modalHeight ≈ 0.76 * termHeight - 2,
  // minus header + footer + padding ≈ 6 rows). Fall back to HELP_PAGE when
  // termHeight is tiny so the visible slice is never negative.
  const modalHeight = Math.max(12, termHeight - Math.floor(termHeight * 0.12) * 2 - 2);
  const pageSize = Math.max(HELP_PAGE, modalHeight - 6);
  const visible = state.entries.slice(state.scroll, state.scroll + pageSize);
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
        visible: pageSize,
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

function pickerRow(
  c: PickerCandidate,
  i: number,
  highlighted: boolean,
  display: ResolvedDisplay,
): ReturnType<typeof Text> {
  const rich = display.color === "truecolor" || display.color === "256";
  const chip = labelChipText({ index: i, key: c.key ?? null, mode: display.labelChip });
  // `◆` marks the model's prediction; mono falls back to `*`. The
  // keyboard-highlighted row uses accent tone + bold rather than a
  // separate cursor glyph — same numbered chip pattern as the chip rail.
  const predictedMark = c.predicted ? (rich ? "◆" : "*") : " ";
  const confText =
    c.predicted && c.confidence !== null ? `  ${Math.round(c.confidence * 100)}%` : "";
  if (!rich) {
    const line = ` ${predictedMark} ${chip}  ${c.label}${confText}`;
    return Text({
      content: line,
      attributes: highlighted ? TextAttributes.BOLD : TextAttributes.DIM,
    });
  }
  const tone: Segment["tone"] = highlighted ? "accent" : "default";
  const chipTone: Segment["tone"] = highlighted ? "accent" : c.predicted ? "accent" : "accentDeep";
  const segs: Segment[] = [
    { text: " ", tone: "default" },
    { text: predictedMark, tone: c.predicted ? "accent" : "default" },
    { text: " ", tone: "default" },
    { text: chip, tone: chipTone },
    { text: "  ", tone: "default" },
    ...foldNamespace(c.label, tone),
  ];
  if (confText) segs.push({ text: confText, tone: "muted" });
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

function renderBulkConfirm(
  state: BulkConfirmState,
  display: ResolvedDisplay,
  termWidth: number,
  termHeight: number,
): ReturnType<typeof Box> {
  const action = state.action;
  const title =
    action === "relabel" && state.label ? `Bulk relabel → ${state.label}` : `Bulk ${action}`;
  const eligibleCount = state.eligible.length;
  const excludedCount = state.excluded.length;
  const lines: ReturnType<typeof Text>[] = [
    Text({
      content: ` ${eligibleCount} record(s) will be affected`,
      attributes: TextAttributes.BOLD,
    }),
  ];
  if (excludedCount > 0) {
    lines.push(
      Text({
        content: ` ${excludedCount} already-reviewed marked record(s) excluded`,
        attributes: TextAttributes.DIM,
      }),
    );
  }
  lines.push(Text({ content: "" }));
  lines.push(
    Text({
      content: " [enter] confirm · [v] view marked · [esc] cancel",
      attributes: TextAttributes.DIM,
    }),
  );
  return modalBox(display, termWidth, termHeight, 0.4, title, ...lines);
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
    ...renderNotePresets(state, display),
    Text({
      content:
        state.presets.length > 0
          ? " [enter] save · [shift+enter] newline · [alt+1-9] preset · [esc] cancel"
          : " [enter] save · [shift+enter] newline · [esc] cancel",
      attributes: TextAttributes.DIM,
    }),
  );
}

function renderNotePresets(state: NoteState, display: ResolvedDisplay): ReturnType<typeof Text>[] {
  if (state.presets.length === 0) return [];
  const lines = state.presets.map((preset, idx) =>
    Text({
      content: ` [${idx + 1}] ${preset}`,
      attributes: TextAttributes.DIM,
      fg:
        display.color === "truecolor" || display.color === "256"
          ? resolveTheme(display).fg.dim
          : undefined,
    }),
  );
  return [Text({ content: "" }), ...lines];
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
