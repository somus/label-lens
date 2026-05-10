import { asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

/**
 * Matches a record when:
 *   - latest effective review's final_label = <value>, or
 *   - no effective review exists AND primary prediction label = <value>.
 *
 * Reviewer-set label takes precedence so corrections don't double-count under
 * the predicted label.
 */
export function byLabel(value: string): QueueDefinition {
  if (value.length === 0) throw new Error("by-label needs <label>");
  return {
    id: `by-label:${value}`,
    label: `Label: ${value}`,
    query: {
      where: sql`COALESCE(
        (
          SELECT er.final_label FROM effective_reviews er
          WHERE er.record_id = ${recordsWithPrimary.id}
          ORDER BY er.id DESC LIMIT 1
        ),
        ${recordsWithPrimary.primaryLabel}
      ) = ${value}`,
      orderBy: asc(recordsWithPrimary.rowIndex),
    },
  };
}
