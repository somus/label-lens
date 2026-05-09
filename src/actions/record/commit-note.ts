import type { ReviewContext } from "../../app/context.ts";
import { updateRecordNote } from "../../store/records.ts";

/** Commit the current note prompt's value to the record's note column. */
export function commitNote(ctx: ReviewContext): void {
  const prompt = ctx.notePrompt;
  if (!prompt) return;
  updateRecordNote(ctx.db, prompt.recordId, prompt.value);
  ctx.exitOverlay();
  ctx.cursor.refresh();
}
