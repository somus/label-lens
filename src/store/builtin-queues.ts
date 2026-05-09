import type { QueueQuery } from "./queries.ts";

export type QueueId = string;

export type QueueDefinition = {
  id: QueueId;
  label: string;
  query: QueueQuery;
};

const NOT_REVIEWED = `NOT EXISTS (
  SELECT 1 FROM reviews v
  WHERE v.record_id = records_with_primary.id
)`;

export const BUILTIN_QUEUES: Record<QueueId, QueueDefinition> = {
  pending: {
    id: "pending",
    label: "Pending",
    query: { where: NOT_REVIEWED, orderBy: "ORDER BY row_index ASC" },
  },
};

export function resolveQueue(id: QueueId): QueueDefinition {
  const def = BUILTIN_QUEUES[id];
  if (!def) throw new Error(`unknown queue: ${id}`);
  return def;
}
