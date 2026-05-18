import type { Command } from "../command.ts";

export const prev: Command = {
  name: "record.prev",
  scope: "review",
  binding: "k",
  enabled: (ctx) => ctx.cursor !== null,
  run: (ctx) => {
    ctx.cursor?.prev();
    // ADR 0004: assistant exposure is per-focus-session. Moving to a new
    // record discards prior viewing. cursor.prev() is synchronous today;
    // any future async navigation must clear the Set before yielding.
    ctx.clearViewedAssistant();
  },
};
