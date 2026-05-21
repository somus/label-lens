import type { Command } from "../command.ts";

export const next: Command = {
  name: "record.next",
  scope: "review",
  bindings: { vim: "j", simple: "down" },
  // Footer renderer pairs this with `record.prev` so the entry shows both
  // keys (vim: `[j/k]`, simple: `[↓/↑]`) under a single `nav` label.
  footer: { label: "nav", order: 5 },
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
    if (before !== after) {
      ctx.clearViewedAssistant();
      ctx.clearMultiLabelDraft();
      ctx.clearExtractionDraft();
    }
  },
};
