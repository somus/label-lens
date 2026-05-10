import { asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

/**
 * Records whose **latest effective review** flipped <from> → <to>. Reads
 * `effective_reviews` (ADR 0007) so undo / re-review naturally drop the row.
 */
export function byCorrection(from: string, to: string): QueueDefinition {
  if (from.length === 0 || to.length === 0) {
    throw new Error("by-correction needs <from>:<to>");
  }
  return {
    id: `by-correction:${from}:${to}`,
    label: `Correction: ${from} → ${to}`,
    query: {
      where: sql`EXISTS (
        SELECT 1 FROM effective_reviews er
        WHERE er.record_id = ${recordsWithPrimary.id}
          AND er.id = (
            SELECT er2.id FROM effective_reviews er2
            WHERE er2.record_id = ${recordsWithPrimary.id}
            ORDER BY er2.id DESC LIMIT 1
          )
          AND er.prev_label = ${from}
          AND er.final_label = ${to}
      )`,
      orderBy: asc(recordsWithPrimary.rowIndex),
    },
  };
}
