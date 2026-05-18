import type { Command } from "../command.ts";

export const next: Command = {
  name: "record.next",
  scope: "review",
  binding: "j",
  enabled: (ctx) => ctx.cursor !== null,
  run: (ctx) => {
    const before = ctx.cursor?.current()?.id;
    ctx.cursor?.next();
    const after = ctx.cursor?.current()?.id;
    // ADR 0004: assistant exposure is per-focus-session. Only clear when the
    // cursor actually moved — pressing `j` at the end clamps to the same
    // record and must preserve the assistant tag. cursor.next() is
    // synchronous today; any future async navigation must clear the Set
    // before yielding.
    if (before !== after) ctx.clearViewedAssistant();
  },
};
