import type { LabellensConfig } from "../config/config.ts";
import { type Cursor, openCursor } from "../cursor/cursor.ts";
import type { Overlay } from "../overlay/types.ts";
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
  flash: FlashMessage | null;
  setFlash(message: string, kind: FlashKind, ttlMs?: number): void;
  clearFlash(): void;
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
};

export function createAppContext(args: {
  db: Db;
  config: LabellensConfig;
  display: ResolvedDisplay;
  requestRender: () => void;
  onQuit: () => void;
}): AppContext {
  const cursors = new Map<QueueId, Cursor>();
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  const ctx: AppContext = {
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
    openOverlay(o) {
      ctx.overlay = o;
      ctx.requestRender();
    },
    closeOverlay() {
      ctx.overlay = null;
      ctx.requestRender();
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
