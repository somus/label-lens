import type { CommandRegistry } from "../actions/command.ts";
import type { LabellensConfig } from "../config/config.ts";
import { type Cursor, openCursor } from "../cursor/cursor.ts";
import type { Overlay } from "../overlay/types.ts";
import {
  createMotionController,
  type MotionController,
  type MotionSchedulerOptions,
} from "../render/anim.ts";
import type { ResolvedDisplay } from "../render/capability.ts";
import type { Db } from "../store/db.ts";
import type { QueueId } from "../store/queues/registry.ts";

export type FlashKind = "info" | "error";

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
  /**
   * Re-runs the underlying query for every cursor opened so far. Called after
   * background work (e.g. the signals worker) writes rows that affect queue
   * membership — the `flagged` and `by-issue:*` cursors otherwise hold stale
   * row sets until the user navigates away and back.
   */
  refreshAllCursors(): void;
  flash: FlashMessage | null;
  setFlash(message: string, kind: FlashKind, ttlMs?: number): void;
  clearFlash(): void;
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
   * Queue screen. Unset in tests; the corresponding command flashes "Queue
   * screen unavailable" rather than crashing.
   */
  openQueueScreen?: () => void;
  /**
   * Set by the orchestrator (cli/run.ts) so review-scope `t` and the
   * `:stats` palette can open the Stats screen. Unset in tests; the
   * corresponding command flashes "Stats screen unavailable" rather than
   * crashing.
   */
  openStatsScreen?: () => void;
  paletteHistory: string[];
  pushPaletteHistory(entry: string): void;
  /**
   * Set by the screen at mount so palette/help commands can read the active
   * registry without each command importing the global one. Unset in unit
   * tests that drive a single Command directly.
   */
  commandRegistry?: CommandRegistry;
  /** Active scope for palette + help filtering (review / queue / stats). */
  activeScope?: import("../keymap/engine.ts").Scope;
};

export const PALETTE_HISTORY_LIMIT = 50;

export function createAppContext(args: {
  db: Db;
  config: LabellensConfig;
  display: ResolvedDisplay;
  requestRender: () => void;
  onQuit: () => void;
  motionOptions?: Pick<MotionSchedulerOptions, "now" | "setInterval" | "clearInterval">;
}): AppContext {
  const cursors = new Map<QueueId, Cursor>();
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  let inputPendingUntil = 0;
  let ctx: AppContext;
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
        cursor = openCursor(args.db, queueId);
        cursor.on("change", () => ctx.requestRender());
        cursors.set(queueId, cursor);
      }
      return cursor;
    },
    hasCursor(queueId) {
      return cursors.has(queueId);
    },
    refreshAllCursors() {
      for (const cursor of cursors.values()) cursor.refresh();
    },
    setFlash(message, kind, ttlMs = 3000) {
      ctx.flash = { kind, message, expiresAt: Date.now() + ttlMs };
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
      }, ttlMs + 10);
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
      ctx.overlay = null;
      ctx.requestRender();
    },
    paletteHistory: [],
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
export function enterReview(app: AppContext, queueId: QueueId = "pending"): AppContext {
  app.cursor = app.getCursor(queueId);
  app.queueId = queueId;
  return app;
}
