import { openNote } from "../../overlay/note.ts";
import type { Command } from "../command.ts";

export const openNoteCommand: Command = {
  name: "record.openNote",
  scope: "review",
  binding: "n",
  enabled: (ctx) => ctx.cursor?.current() != null,
  run: (ctx) => {
    const record = ctx.cursor?.current();
    if (!record) return;
    const state = openNote({ recordId: record.id, initial: record.note ?? "" });
    ctx.openOverlay({ kind: "note", state });
  },
};
