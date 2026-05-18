import type { Command } from "../command.ts";

export const next: Command = {
  name: "record.next",
  scope: "review",
  binding: "j",
  enabled: (ctx) => ctx.cursor !== null,
  run: (ctx) => {
    ctx.cursor?.next();
    // ADR 0004: assistant exposure is per-focus-session. Moving to a new
    // record discards prior viewing.
    ctx.clearViewedAssistant();
  },
};
