import type { ReviewContext } from "../../app/context.ts";
import { QUEUE_CYCLE, resolveQueue } from "../../store/queues/registry.ts";
import type { Command } from "../command.ts";

function step(ctx: ReviewContext, delta: 1 | -1): void {
  const cur = ctx.cursor.queueId;
  const idx = QUEUE_CYCLE.indexOf(cur);
  const baseIdx = idx < 0 ? 0 : idx;
  const next = QUEUE_CYCLE[(baseIdx + delta + QUEUE_CYCLE.length) % QUEUE_CYCLE.length];
  if (!next || next === cur) return;
  ctx.cursor = ctx.getCursor(next);
  ctx.setFlash(`Queue: ${resolveQueue(next).label}`, "info", 1500);
  ctx.requestRender();
}

export const nextQueue: Command<ReviewContext> = {
  name: "queue.next",
  scope: "review",
  binding: "]",
  run: (ctx) => step(ctx, 1),
};

export const prevQueue: Command<ReviewContext> = {
  name: "queue.prev",
  scope: "review",
  binding: "[",
  run: (ctx) => step(ctx, -1),
};
