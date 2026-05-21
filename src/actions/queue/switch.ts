import { type AppContext, effectiveQueueId } from "../../app/context.ts";
import { flash } from "../../render/anim.ts";
import { type QueueId, resolveQueue } from "../../store/queues/registry.ts";
import type { Command } from "../command.ts";

/**
 * Swap the AppContext to a different queue. Used by both the in-review key
 * cycler (`[`/`]`, see cycle-queue.ts) and the upcoming palette `:queue
 * <name>` (#6) — palette dispatches to this directly so parameterized ids
 * (`by-source:llm:gpt-4`, `where:source = '…'`) don't need a Command per id.
 */
export function switchQueue(ctx: AppContext, queueId: QueueId): void {
  const def = resolveQueue(queueId);
  const effective = effectiveQueueId(ctx, queueId);
  // Cached cursors may be stale if reviews landed while focused elsewhere;
  // a freshly-constructed cursor is already current (see Cursor constructor),
  // so refreshing twice would just double the queueRecords cost.
  const cached = ctx.hasCursor(effective);
  const cursor = ctx.getCursor(effective);
  if (cached) cursor.refresh();
  ctx.cursor = cursor;
  ctx.queueId = queueId;
  ctx.clearViewedAssistant();
  ctx.clearMultiLabelDraft();
  ctx.clearSavedAssistant();
  ctx.motion.play("status.queue", flash(120, "info"));
  ctx.setFlash(`Queue: ${def.label}`, "info", 1500);
  ctx.requestRender();
}

const STATIC_QUEUES: QueueId[] = [
  "pending",
  "skipped",
  "marked",
  "low-confidence",
  "disagreements",
  "flagged",
];

const PALETTE_SHORTCUTS = new Set<QueueId>([
  "pending",
  "skipped",
  "low-confidence",
  "disagreements",
  "flagged",
]);

const QUEUE_DESCRIPTIONS: Record<QueueId, string> = {
  pending: "Awaiting your label",
  skipped: "Reviewed but punted",
  marked: "Flagged for follow-up via [m]",
  "low-confidence": "Predictions with the weakest scores",
  disagreements: "Sources predict different labels",
  flagged: "Imported or computed signals",
};

// Per-queue switch commands. Most built-ins also surface as palette
// shortcuts; `marked` stays dispatchable for the queue overlay while
// `palette.marked` owns the visible `:marked` row.
function switchCommand(id: QueueId): Command {
  const palette = PALETTE_SHORTCUTS.has(id)
    ? {
        palette: `:${id}`,
        paletteMetadata: {
          category: "queues" as const,
          description: QUEUE_DESCRIPTIONS[id],
        },
      }
    : {};
  return {
    name: `queue.switch.${id}`,
    scope: "global",
    ...palette,
    enabled: () => true,
    run: (ctx) => switchQueue(ctx, id),
  };
}

export const queueSwitchCommands: Command[] = STATIC_QUEUES.map(switchCommand);
