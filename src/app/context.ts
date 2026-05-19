import type { CommandRegistry } from "../actions/command.ts";
import type { LabellensConfig } from "../config/config.ts";
import { type Cursor, openCursor } from "../cursor/cursor.ts";
import { createSmartLearning, type SmartLearning } from "../learning/smart-learning.ts";
import type { Overlay } from "../overlay/types.ts";
import {
  createMotionController,
  type MotionController,
  type MotionSchedulerOptions,
  progressTick,
} from "../render/anim.ts";
import type { ResolvedDisplay } from "../render/capability.ts";
import type { Db } from "../store/db.ts";
import { recentReviewsWithText } from "../store/queries.ts";
import type { QueueDefinition, QueueId } from "../store/queues/registry.ts";
import { buildSmartPendingQuery } from "../store/queues/smart-pending.ts";
import { queueProgress, type SidebarData, signalCounts, statsTotals } from "./sidebar-data.ts";

/**
 * Flash message kinds. Each maps to a glyph (`✓ ⓘ ⚠ ✗`) and a default
 * duration via `DEFAULT_FLASH_TTL`. Per plan D3, classify callsites:
 *   success — completed mutation reviewer can confirm worked (`Accepted X`,
 *             `Exported to Y`).
 *   info    — neutral state change with no error (`Queue: pending`,
 *             `Mode: smart`).
 *   warning — non-blocking refusal or no-op (`Nothing to undo`, `Already at end`).
 *   error   — blocking failure (`Cannot accept: no prediction`,
 *             `command registry unavailable`).
 */
export type FlashKind = "success" | "info" | "warning" | "error";

/**
 * Default flash duration per kind. `setFlash(msg, kind)` reads from this when
 * ttlMs is omitted. Callers can still override per-call. Plan D4.
 */
export const DEFAULT_FLASH_TTL: Record<FlashKind, number> = {
  success: 1500,
  info: 2000,
  warning: 3000,
  error: 5000,
};

export type FlashMessage = {
  kind: FlashKind;
  message: string;
  expiresAt: number;
};

export type DocViewState = {
  documentId: string;
  returnRecordId: string;
  scrollTop: number;
};

export type AppContext = {
  db: Db;
  config: LabellensConfig;
  getCursor(queueId: QueueId): Cursor;
  /**
   * Returns whether the next `getCursor(queueId)` call would create a new
   * Cursor (true) or return a cached one (false). Lets callers skip an
   * unnecessary `cursor.refresh()` on first switch — the constructor already
   * runs `queueRecords`, so an extra refresh would double the cost. Used by
   * `switchQueue` so the <200ms target (PRD §16.1) holds at 50K records.
   */
  hasCursor(queueId: QueueId): boolean;
  flash: FlashMessage | null;
  setFlash(message: string, kind: FlashKind, ttlMs?: number): void;
  clearFlash(): void;
  /**
   * Session counters reset on AppContext creation. Incremented by action
   * dispatchers when the reviewer commits a decision / skip / mark toggle.
   * Sidebar reads these as `Counters` rows; sidebar flashes the affected row
   * on increment via the `sidebar.counter.<kind>` motion key.
   */
  sessionCounters: { reviewed: number; skipped: number; marked: number };
  /**
   * Compute a fresh SidebarData snapshot from the current cursor, queue, and
   * session counters. Called lazily by the chrome renderer — the three
   * underlying queries (queueProgress, signalCounts, statsTotals) are small
   * and indexed, so per-render is acceptable at MVP scale. Mode is `queue`
   * when a cursor is bound (review screen) and `stats` otherwise (stats
   * screen mounts call it after switching scope).
   */
  getSidebarData(mode?: "queue" | "stats"): SidebarData;
  /**
   * Tween the sidebar progress bar (plan A12). Renderer passes the latest
   * `queueProgress.reviewed` value; this helper compares it to the last
   * observed value, fires a `progressTick` motion token on increment, and
   * returns the (possibly mid-tween) display value to render. When motion
   * is gated off this is a pass-through.
   */
  observeProgress(reviewed: number): number;
  motion: MotionController;
  noteInput(): void;
  requestRender(): void;
  onQuit(): void;
  overlay: Overlay | null;
  openOverlay(o: Overlay): void;
  closeOverlay(): void;
  /** The active Cursor + queue when a review screen is mounted. Null otherwise. */
  cursor: Cursor | null;
  queueId: QueueId | null;
  display: ResolvedDisplay;
  docView: DocViewState | null;
  openDocView(state: DocViewState): void;
  closeDocView(): void;
  /**
   * Set by the orchestrator (cli/run.ts) so review-scope commands can pop the
   * queue overlay over Review.
   */
  openQueueScreen?: () => void;
  paletteHistory: string[];
  pushPaletteHistory(entry: string): void;
  /**
   * Per-focus-session tracking: record ids whose assistant panel has been
   * opened. Cleared on cursor navigation (`record.next` / `record.prev`).
   * Read at decision-commit time to tag `source_of_truth = 'human+assistant'`
   * for any record that saw the assistant during this focus session (ADR 0004).
   */
  viewedAssistant: Set<string>;
  clearViewedAssistant(): void;
  /**
   * In-flight assistant stream's AbortController. Set by `record.openAssistant`
   * when a query fires; cleared (and aborted) by `cancelAssistantStream` when
   * the reviewer dismisses the overlay or navigates to a different record so
   * orphaned requests don't keep burning provider quota.
   */
  assistantAbort: { recordId: string; controller: AbortController } | null;
  cancelAssistantStream(): void;
  /**
   * True when `--local-only` was set on the CLI. Threaded into provider
   * validation so a misconfigured remote provider aborts before any network
   * call.
   */
  localOnly: boolean;
  /**
   * Absolute path to `labellens.config.json`. Set by `runReview`; unset in
   * unit tests so the `updateAssistantConfig` effect skips the disk write.
   */
  configPath?: string;
  /**
   * Set by the screen at mount so palette/help commands can read the active
   * registry without each command importing the global one. Unset in unit
   * tests that drive a single Command directly.
   */
  commandRegistry?: CommandRegistry;
  /** Active scope for palette + help filtering (review / queue / stats). */
  activeScope?: import("../keymap/engine.ts").Scope;
  /**
   * Session-local active learning for the smart-pending Queue (issue #93).
   * Tracks `relabeled` decisions per built-in Issue type and re-weights the
   * cursor's score expression on the next decision-driven refresh. Resets on
   * app relaunch — never persisted.
   */
  smartLearning: SmartLearning;
};

export const PALETTE_HISTORY_LIMIT = 50;

export function createAppContext(args: {
  db: Db;
  config: LabellensConfig;
  display: ResolvedDisplay;
  requestRender: () => void;
  onQuit: () => void;
  motionOptions?: Pick<MotionSchedulerOptions, "now" | "setInterval" | "clearInterval">;
  localOnly?: boolean;
  configPath?: string;
}): AppContext {
  const cursors = new Map<QueueId, Cursor>();
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  let inputPendingUntil = 0;
  let lastObservedProgress: number | null = null;
  let ctx: AppContext;
  const smartLearning = createSmartLearning({
    rerankInterval: args.config.navigation?.rerankInterval ?? 25,
    rerankColdStart: args.config.navigation?.rerankColdStart ?? 50,
  });
  function factoryFor(queueId: QueueId): (() => QueueDefinition) | undefined {
    if (queueId !== "smart-pending") return undefined;
    return () => ({
      id: "smart-pending",
      label: "Pending (smart)",
      query: buildSmartPendingQuery({ weights: smartLearning.weights() }),
    });
  }
  const motion = createMotionController({
    enabled: args.display.motion,
    requestRender: () => ctx.requestRender(),
    isInputPending: () => Date.now() < inputPendingUntil,
    ...args.motionOptions,
  });
  ctx = {
    db: args.db,
    config: args.config,
    flash: null,
    overlay: null,
    cursor: null,
    queueId: null,
    display: args.display,
    docView: null,
    sessionCounters: { reviewed: 0, skipped: 0, marked: 0 },
    observeProgress(reviewed) {
      // Tween the bar on increment (plan A12). Update the cached `prev`
      // value BEFORE calling `motion.play` — play() invokes requestRender
      // synchronously, which re-enters this function. If we updated the
      // cursor after play(), the recursive call would still see the old
      // value, trigger play() again, and overflow the stack.
      const prev = lastObservedProgress;
      lastObservedProgress = reviewed;
      if (prev !== null && reviewed !== prev && args.display.motion) {
        motion.play("sidebar.progress", progressTick(prev, reviewed, 600));
      }
      const snap = motion.snapshot("sidebar.progress");
      if (snap.active && snap.value !== null) return snap.value;
      return reviewed;
    },
    getSidebarData(mode = "queue") {
      const datasetPath = args.config.input.path;
      if (mode === "stats") {
        return {
          mode: "stats",
          datasetPath,
          totals: statsTotals(args.db),
        };
      }
      const cursor = ctx.cursor;
      const queueId = ctx.queueId;
      // Queue mode without a cursor (pre-mount) collapses to a 0/0 view.
      const queueLabel = queueId ?? "—";
      const queueTotal = cursor?.total ?? 0;
      const queuePosition = cursor && cursor.total > 0 ? cursor.position + 1 : 0;
      const ids = cursor ? cursor.recordIds() : null;
      const history = recentReviewsWithText(args.db, 5).map((h) => ({
        status: h.status,
        label: h.final_label ?? h.prev_label,
        recordText: h.recordText,
      }));
      return {
        mode: "queue",
        queueLabel,
        queuePosition,
        queueTotal,
        datasetPath,
        counters: { ...ctx.sessionCounters },
        queueProgress: queueProgress(args.db),
        signals: signalCounts(args.db, ids),
        history,
        smartNext: args.config.navigation?.smartNext ?? false,
      };
    },
    requestRender: args.requestRender,
    onQuit: args.onQuit,
    openDocView(state) {
      ctx.docView = state;
      ctx.requestRender();
    },
    closeDocView() {
      ctx.docView = null;
      ctx.requestRender();
    },
    getCursor(queueId) {
      let cursor = cursors.get(queueId);
      if (!cursor) {
        cursor = openCursor(args.db, queueId, factoryFor(queueId));
        cursor.on("change", () => ctx.requestRender());
        cursors.set(queueId, cursor);
      }
      return cursor;
    },
    hasCursor(queueId) {
      return cursors.has(queueId);
    },
    setFlash(message, kind, ttlMs) {
      const duration = ttlMs ?? DEFAULT_FLASH_TTL[kind];
      ctx.flash = { kind, message, expiresAt: Date.now() + duration };
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flashTimer = null;
        if (ctx.flash && ctx.flash.expiresAt <= Date.now()) {
          ctx.flash = null;
          // Tests can let the AppContext outlive its sqlite handle; the
          // expiry tick must not crash the process if requestRender ends up
          // querying a closed db.
          try {
            ctx.requestRender();
          } catch {
            // swallow — re-render is best-effort here
          }
        }
      }, duration + 10);
      ctx.requestRender();
    },
    clearFlash() {
      if (flashTimer) {
        clearTimeout(flashTimer);
        flashTimer = null;
      }
      ctx.flash = null;
      ctx.requestRender();
    },
    motion,
    noteInput() {
      inputPendingUntil = Date.now() + 16;
    },
    openOverlay(o) {
      ctx.overlay = o;
      ctx.requestRender();
    },
    closeOverlay() {
      // If the closing overlay was the assistant, cancel its in-flight
      // stream — Esc, Enter (commit), and configure-overlay re-open all
      // funnel through here. Aborts that target a different record are
      // already a no-op so this is safe to call unconditionally.
      ctx.cancelAssistantStream();
      ctx.overlay = null;
      ctx.requestRender();
    },
    paletteHistory: [],
    viewedAssistant: new Set<string>(),
    clearViewedAssistant() {
      ctx.viewedAssistant.clear();
      // Reviewer left the focus session for this record — also cancel any
      // assistant stream still in flight against it. Keeping the request alive
      // wastes quota and risks tokens arriving after the overlay was already
      // dismissed.
      ctx.cancelAssistantStream();
    },
    assistantAbort: null,
    cancelAssistantStream() {
      const cur = ctx.assistantAbort;
      if (!cur) return;
      ctx.assistantAbort = null;
      try {
        cur.controller.abort();
      } catch {
        // AbortController.abort() can throw on environments where it's been
        // patched (older bun). Swallow — the request will just complete and
        // its callbacks already self-check that the overlay is still focused.
      }
    },
    localOnly: args.localOnly ?? false,
    configPath: args.configPath,
    smartLearning,
    pushPaletteHistory(entry) {
      const trimmed = entry.trim();
      if (trimmed.length === 0) return;
      const existing = ctx.paletteHistory.indexOf(trimmed);
      if (existing !== -1) ctx.paletteHistory.splice(existing, 1);
      ctx.paletteHistory.push(trimmed);
      if (ctx.paletteHistory.length > PALETTE_HISTORY_LIMIT) {
        ctx.paletteHistory.splice(0, ctx.paletteHistory.length - PALETTE_HISTORY_LIMIT);
      }
    },
  };
  return ctx;
}

/**
 * Bind a Cursor + queue to the AppContext for the duration of a review screen.
 * Returns the same AppContext (mutated) so callers can chain.
 */
/**
 * Maps a user-requested queue id to the cursor id actually opened. When
 * smart-next is enabled and the user navigates to `pending`, we open the
 * `smart-pending` cursor under the hood — same WHERE filter, signal-weighted
 * ordering. The display still labels the queue "Pending" (queueId stays
 * unchanged), with a `▸ smart` badge announcing the mode.
 */
export function effectiveQueueId(app: AppContext, queueId: QueueId): QueueId {
  if (queueId === "pending" && app.config.navigation?.smartNext) return "smart-pending";
  return queueId;
}

export function enterReview(app: AppContext, queueId: QueueId = "pending"): AppContext {
  app.cursor = app.getCursor(effectiveQueueId(app, queueId));
  app.queueId = queueId;
  return app;
}
