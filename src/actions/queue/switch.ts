import type { AppContext } from "../../app/context.ts";
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
  const cursor = ctx.getCursor(queueId);
  cursor.refresh();
  ctx.cursor = cursor;
  ctx.queueId = queueId;
  ctx.setFlash(`Queue: ${def.label}`, "info", 1500);
  ctx.requestRender();
}

const STATIC_QUEUES: { id: QueueId; palette: string }[] = [
  { id: "pending", palette: "Switch queue: Pending" },
  { id: "skipped", palette: "Switch queue: Skipped" },
  { id: "low-confidence", palette: "Switch queue: Low confidence" },
  { id: "disagreements", palette: "Switch queue: Disagreements" },
  { id: "flagged", palette: "Switch queue: Flagged" },
  { id: "marked", palette: "Switch queue: Marked" },
];

function switchCommand(id: QueueId, palette: string): Command {
  return {
    name: `queue.switch.${id}`,
    scope: "global",
    palette,
    enabled: () => true,
    run: (ctx) => switchQueue(ctx, id),
  };
}

export const queueSwitchCommands: Command[] = STATIC_QUEUES.map((q) =>
  switchCommand(q.id, q.palette),
);
