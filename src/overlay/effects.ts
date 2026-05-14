import type { AppContext } from "../app/context.ts";
import { predicateQueue } from "../store/queues/predicate.ts";
import { queueCount } from "../store/queues/queue-counts.ts";
import type { QueueId } from "../store/queues/registry.ts";
import { insertReview, updateRecordNote } from "../store/records.ts";
import type { Effect } from "./types.ts";

export type DispatchCommandFn = (name: string, argument?: string) => void | Promise<void>;

/**
 * Interpret data Effects emitted by an Overlay reducer against the AppContext.
 * Source-of-truth side effects (ADR 0004) live here so reducers stay pure.
 *
 * `dispatchCommand` is the screen-supplied callback that re-enters the
 * Command dispatcher when an overlay emits a `runCommand` effect (palette).
 * Unit tests can omit it; the interpreter then flashes an error rather
 * than silently dropping the dispatch.
 */
export function applyEffects(
  app: AppContext,
  queueId: QueueId,
  effects: Effect[],
  dispatchCommand?: DispatchCommandFn,
): void {
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
      case "runCommand":
        if (!dispatchCommand) {
          app.setFlash(`palette: cannot dispatch ${effect.commandName} (no handler)`, "error");
          break;
        }
        void dispatchCommand(effect.commandName, effect.argument);
        break;
      case "pushPaletteHistory":
        app.pushPaletteHistory(effect.entry);
        break;
      case "scheduleFilterPreview":
        setTimeout(() => {
          const overlay = app.overlay;
          if (overlay?.kind !== "filter-builder") return;
          if (overlay.state.revision !== effect.revision) return;
          try {
            overlay.state = {
              ...overlay.state,
              preview: {
                kind: "ready",
                count: queueCount(app.db, predicateQueue(effect.predicate)),
              },
            };
          } catch (err) {
            overlay.state = {
              ...overlay.state,
              preview: { kind: "error", message: err instanceof Error ? err.message : String(err) },
            };
          }
          try {
            app.requestRender();
          } catch {
            // Tests can dispose the sqlite handle before a debounce fires.
          }
        }, 200);
        break;
    }
  }
}
