import { type AppContext, effectiveQueueId } from "../../app/context.ts";
import { flash } from "../../render/anim.ts";
import { QUEUE_CYCLE, resolveQueue } from "../../store/queues/registry.ts";
import type { Command } from "../command.ts";

function step(ctx: AppContext, delta: 1 | -1): void {
  if (!ctx.queueId) return;
  const cur = ctx.queueId;
  const idx = QUEUE_CYCLE.indexOf(cur);
  const baseIdx = idx < 0 ? 0 : idx;
  const next = QUEUE_CYCLE[(baseIdx + delta + QUEUE_CYCLE.length) % QUEUE_CYCLE.length];
  if (!next || next === cur) return;
  const effective = effectiveQueueId(ctx, next);
  const cached = ctx.hasCursor(effective);
  const cursor = ctx.getCursor(effective);
  // Cached cursors may be stale if reviews landed while focused on a
  // different queue. A freshly-constructed cursor is already current — its
  // ctor runs queueRecords — so refreshing twice would just double the cost.
  if (cached) cursor.refresh();
  ctx.cursor = cursor;
  ctx.queueId = next;
  ctx.clearViewedAssistant();
  ctx.motion.play("status.queue", flash(120, "info"));
  ctx.setFlash(`Queue: ${resolveQueue(next).label}`, "info", 1500);
  ctx.requestRender();
}

export const nextQueue: Command = {
  name: "queue.next",
  scope: "review",
  binding: "]",
  // Cycle keys aren't standalone footer entries — they'd cost ~22ch on a
  // 120-col row. `[Q] queues  [/]` (see open-screen.ts) advertises the
  // pair next to the queue-screen binding.
  enabled: (ctx) => ctx.cursor !== null,
  run: (ctx) => step(ctx, 1),
};

export const prevQueue: Command = {
  name: "queue.prev",
  scope: "review",
  binding: "[",
  enabled: (ctx) => ctx.cursor !== null,
  run: (ctx) => step(ctx, -1),
};
