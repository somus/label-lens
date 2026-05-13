import { and, sql } from "drizzle-orm";
import type { QueueQuery } from "../store/queries.ts";
import { recordsWithPrimary } from "../store/schema.ts";

const NOT_ORPHAN = sql`${recordsWithPrimary.orphan} = 0`;

export function withOrphanFilter(
  query: QueueQuery | undefined,
  includeOrphans: boolean,
): QueueQuery {
  if (includeOrphans) return query ?? {};
  const where = query?.where ? and(query.where, NOT_ORPHAN) : NOT_ORPHAN;
  return { ...(query ?? {}), where };
}
