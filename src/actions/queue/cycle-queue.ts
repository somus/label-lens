import type { AppContext } from "../../app/context.ts";
import { QUEUE_CYCLE, resolveQueue } from "../../store/queues/registry.ts";
import type { Command } from "../command.ts";

function step(ctx: AppContext, delta: 1 | -1): void {
  if (!ctx.queueId) return;
  const cur = ctx.queueId;
  const idx = QUEUE_CYCLE.indexOf(cur);
  const baseIdx = idx < 0 ? 0 : idx;
  const next = QUEUE_CYCLE[(baseIdx + delta + QUEUE_CYCLE.length) % QUEUE_CYCLE.length];
  if (!next || next === cur) return;
  ctx.cursor = ctx.getCursor(next);
  ctx.queueId = next;
  ctx.setFlash(`Queue: ${resolveQueue(next).label}`, "info", 1500);
  ctx.requestRender();
}

export const nextQueue: Command = {
  name: "queue.next",
  scope: "review",
  binding: "]",
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
