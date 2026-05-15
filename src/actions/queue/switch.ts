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
  ctx.motion.play("status.queue", flash(120, "info"));
  ctx.setFlash(`Queue: ${def.label}`, "info", 1500);
  ctx.requestRender();
}

const STATIC_QUEUES: QueueId[] = [
  "pending",
  "skipped",
  "low-confidence",
  "disagreements",
  "flagged",
  "marked",
];

// Palette-discoverable switching is the parametric `palette.queue` command
// (e.g., `:queue pending`). These per-queue commands stay in the registry
// for direct dispatch by name (cli/run.ts and tests reference them) but no
// longer surface in the palette overlay.
function switchCommand(id: QueueId): Command {
  return {
    name: `queue.switch.${id}`,
    scope: "global",
    enabled: () => true,
    run: (ctx) => switchQueue(ctx, id),
  };
}

export const queueSwitchCommands: Command[] = STATIC_QUEUES.map(switchCommand);
