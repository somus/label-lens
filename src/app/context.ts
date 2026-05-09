import type { LabellensConfig } from "../config/config.ts";
import { type Cursor, openCursor } from "../cursor/cursor.ts";
import type { Overlay } from "../overlay/types.ts";
import type { Db } from "../store/db.ts";
import type { QueueId } from "../store/queues/registry.ts";

export type FlashKind = "info" | "error";

export type FlashMessage = {
  kind: FlashKind;
  message: string;
  expiresAt: number;
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
};

export type ReviewContext = AppContext & {
  scope: "review";
  cursor: Cursor;
};

export function createAppContext(args: {
  db: Db;
  config: LabellensConfig;
  requestRender: () => void;
  onQuit: () => void;
}): AppContext {
  const cursors = new Map<QueueId, Cursor>();
  const ctx: AppContext = {
    db: args.db,
    config: args.config,
    flash: null,
    overlay: null,
    requestRender: args.requestRender,
    onQuit: args.onQuit,
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
      ctx.requestRender();
    },
    clearFlash() {
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

export function reviewContext(app: AppContext, queueId: QueueId = "pending"): ReviewContext {
  const ctx = Object.create(app) as ReviewContext;
  ctx.scope = "review";
  ctx.cursor = app.getCursor(queueId);
  return ctx;
}
