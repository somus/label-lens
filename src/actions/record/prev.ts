import type { Command } from "../command.ts";

export const prev: Command = {
  name: "record.prev",
  scope: "review",
  bindings: { vim: "k", simple: "up" },
  enabled: (ctx) => ctx.cursor !== null,
  run: (ctx) => {
    const before = ctx.cursor?.current()?.id;
    ctx.cursor?.prev();
    const after = ctx.cursor?.current()?.id;
    // ADR 0004: assistant exposure is per-focus-session. Only clear when the
    // cursor actually moved — pressing `k` at the top clamps to the same
    // record and must preserve the assistant tag. cursor.prev() is
    // synchronous today; any future async navigation must clear the Set
    // before yielding.
    if (before !== after) {
      ctx.clearViewedAssistant();
      ctx.clearMultiLabelDraft();
      ctx.clearExtractionDraft();
    }
  },
};
