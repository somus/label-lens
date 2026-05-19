import { openNote } from "../../overlay/note.ts";
import type { Command } from "../command.ts";

export const openNoteCommand: Command = {
  name: "record.openNote",
  scope: "review",
  bindings: { vim: "n" },
  footer: { label: "note", order: 50 },
  enabled: (ctx) => ctx.cursor?.current() != null,
  run: (ctx) => {
    const record = ctx.cursor?.current();
    if (!record) return;
    const state = openNote({
      recordId: record.id,
      initial: record.note ?? "",
      presets: ctx.config.notes?.presets,
    });
    ctx.openOverlay({ kind: "note", state });
  },
};
