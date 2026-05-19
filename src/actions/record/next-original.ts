import type { Command } from "../command.ts";

/**
 * Advances the active cursor by one record in *original* (row-index) order,
 * regardless of smart-next mode.
 *
 * When smart-next is on (PRD §14.7), the active cursor walks signal-weighted
 * order; shift+J / shift+K are the escape hatch back to document order
 * without toggling the config flag. When smart-next is off, shift+J /
 * shift+K navigate the same pending-order queue as j / k — the escape
 * hatch is a no-op rather than a separate mode.
 */
function stepOriginal(ctx: import("../../app/context.ts").AppContext, direction: 1 | -1): void {
  if (!ctx.cursor) return;
  const current = ctx.cursor.current();
  if (!current) return;
  const pending = ctx.getCursor("pending");
  if (!pending.seek(current.id)) return;
  if (direction === 1) pending.next();
  else pending.prev();
  const target = pending.current();
  if (target && target.id !== current.id) {
    ctx.cursor.seek(target.id);
    // ADR 0004: assistant exposure is per-focus-session. Only clear when the
    // cursor actually moved — pressing shift+j/shift+k at the boundary
    // clamps to the same record (pending.next/prev clamp) and must preserve
    // the assistant tag. cursor.seek() is synchronous today; any future
    // async navigation must clear the Set before yielding.
    ctx.clearViewedAssistant();
  }
}

export const nextOriginal: Command = {
  name: "record.nextOriginal",
  scope: "review",
  bindings: { vim: "shift+j", simple: "shift+down" },
  enabled: (ctx) => ctx.cursor !== null,
  run: (ctx) => stepOriginal(ctx, 1),
};

export const prevOriginal: Command = {
  name: "record.prevOriginal",
  scope: "review",
  bindings: { vim: "shift+k", simple: "shift+up" },
  enabled: (ctx) => ctx.cursor !== null,
  run: (ctx) => stepOriginal(ctx, -1),
};
