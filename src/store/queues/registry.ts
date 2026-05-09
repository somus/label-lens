import type { QueueQuery } from "../queries.ts";
import { pending } from "./pending.ts";
import { skipped } from "./skipped.ts";

export type QueueId = string;

export type QueueDefinition = {
  id: QueueId;
  label: string;
  query: QueueQuery;
};

export const BUILTIN_QUEUES: Record<QueueId, QueueDefinition> = {
  pending,
  skipped,
};

/** Order in which `[` / `]` cycle the focused queue. */
export const QUEUE_CYCLE: QueueId[] = ["pending", "skipped"];

export function resolveQueue(id: QueueId): QueueDefinition {
  const def = BUILTIN_QUEUES[id];
  if (!def) throw new Error(`unknown queue: ${id}`);
  return def;
}
