import { and, or, sql } from "drizzle-orm";
import type { QueueQuery } from "../store/queries.ts";
import { recordsWithPrimary } from "../store/schema.ts";

const NOT_ORPHAN = sql`${recordsWithPrimary.orphan} = 0`;
const IS_ORPHAN = sql`${recordsWithPrimary.orphan} = 1`;

/**
 * Compose the export's orphan-handling predicate onto the caller's queue
 * scope.
 *
 *  - `includeOrphans=false`: AND `orphan = 0` so orphans are excluded.
 *  - `includeOrphans=true` with no queue scope: drop the orphan filter, every
 *    record (orphan or not) flows through.
 *  - `includeOrphans=true` with a queue scope: OR `orphan = 1`. The queue's
 *    own predicate may hardcode `orphan = 0` (true of every built-in queue);
 *    OR'ing the orphan rows in surfaces them alongside the queue's matches.
 *    This is wider than strictly "orphans matching the queue's other filters"
 *    — but stripping the embedded `orphan = 0` clause out of an opaque SQL
 *    fragment is impractical, and the user opted in explicitly via the flag.
 */
export function withOrphanFilter(
  query: QueueQuery | undefined,
  includeOrphans: boolean,
): QueueQuery {
  if (!includeOrphans) {
    const where = query?.where ? and(query.where, NOT_ORPHAN) : NOT_ORPHAN;
    return { ...(query ?? {}), where };
  }
  if (!query?.where) return query ?? {};
  return { ...query, where: or(query.where, IS_ORPHAN) };
}
