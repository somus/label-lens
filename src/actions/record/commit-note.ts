import type { ReviewContext } from "../../app/context.ts";
import { updateRecordNote } from "../../store/records.ts";
import type { Command } from "../command.ts";

/** Commit the current note prompt's value to the record's note column. */
export const commitNote: Command<ReviewContext> = {
  name: "record.commitNote",
  scope: "note",
  binding: "return",
  run: (ctx) => {
    const prompt = ctx.notePrompt;
    if (!prompt) return;
    updateRecordNote(ctx.db, prompt.recordId, prompt.value);
    ctx.exitOverlay();
    ctx.cursor.refresh();
  },
};
