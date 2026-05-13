import { asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

/**
 * Matches a record when:
 *   - latest effective review's final_label = <value>, or
 *   - no effective review exists AND primary prediction label = <value>.
 *
 * Rejected records (final_label IS NULL) explicitly do NOT match — once the
 * reviewer says the prediction is wrong, the record stops being counted under
 * its predicted label. A naive `COALESCE(final_label, primary_label)` would
 * fall through to the prediction on rejection, which is the opposite of the
 * intended semantics.
 *
 * The subquery's `ORDER BY er.id DESC LIMIT 1` is correct because
 * `effective_reviews` already filters to non-undone, non-compensated rows
 * (ADR 0007); the LIMIT 1 picks the most recent of those per record.
 */
export function byLabel(value: string): QueueDefinition {
  if (value.length === 0) throw new Error("by-label needs <label>");
  return {
    id: `by-label:${value}`,
    label: `Label: ${value}`,
    query: {
      where: sql`((
        (
          SELECT er.final_label FROM effective_reviews er
          WHERE er.record_id = ${recordsWithPrimary.id}
          ORDER BY er.id DESC LIMIT 1
        ) = ${value}
      ) OR (
        NOT EXISTS (
          SELECT 1 FROM effective_reviews er
          WHERE er.record_id = ${recordsWithPrimary.id}
        )
        AND ${recordsWithPrimary.primaryLabel} = ${value}
      )) AND ${recordsWithPrimary.orphan} = 0`,
      orderBy: asc(recordsWithPrimary.rowIndex),
    },
  };
}
