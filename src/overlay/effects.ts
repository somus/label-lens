import type { AppContext } from "../app/context.ts";
import type { QueueId } from "../store/queues/registry.ts";
import { insertReview, updateRecordNote } from "../store/records.ts";
import type { Effect } from "./types.ts";

/**
 * Interpret data Effects emitted by an Overlay reducer against the AppContext.
 * Source-of-truth side effects (ADR 0004) live here so reducers stay pure.
 */
export function applyEffects(app: AppContext, queueId: QueueId, effects: Effect[]): void {
  for (const effect of effects) {
    switch (effect.kind) {
      case "close":
        app.closeOverlay();
        break;
      case "commitDecision": {
        insertReview(app.db, {
          record_id: effect.recordId,
          status: effect.status,
          final_label: effect.finalLabel,
          prev_label: effect.prevLabel,
          source_of_truth: effect.sourceOfTruth,
        });
        app.getCursor(queueId).refresh();
        break;
      }
      case "updateNote":
        updateRecordNote(app.db, effect.recordId, effect.value);
        app.getCursor(queueId).refresh();
        break;
      case "markAssistantViewed":
        // Slice 11 plumbing — flag the record's source-of-truth as 'human+assistant'
        // for the next decision. No-op until then.
        break;
    }
  }
}
