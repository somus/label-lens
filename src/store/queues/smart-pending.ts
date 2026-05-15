import { sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

// Composite score = (low_confidence) + (disagreement) + (flagged).
// Booleans are 0/1 in SQLite, so a plain sum yields 0..3.
// Tie-breakers: confidence ASC (NULL last), then row_index ASC.
const scoreExpr = sql`(
  (${recordsWithPrimary.primaryConfidence} IS NOT NULL AND ${recordsWithPrimary.primaryConfidence} < 0.4)
  + (
    (SELECT COUNT(DISTINCT p.label) FROM predictions p WHERE p.record_id = ${recordsWithPrimary.id}) > 1
  )
  + EXISTS (SELECT 1 FROM issues i WHERE i.record_id = ${recordsWithPrimary.id})
)`;

export const smartPending: QueueDefinition = {
  id: "smart-pending",
  label: "Pending (smart)",
  query: {
    where: sql`NOT EXISTS (
      SELECT 1 FROM effective_reviews er
      WHERE er.record_id = ${recordsWithPrimary.id}
    ) AND ${recordsWithPrimary.orphan} = 0`,
    orderBy: sql`${scoreExpr} DESC, (${recordsWithPrimary.primaryConfidence} IS NULL), ${recordsWithPrimary.primaryConfidence} ASC, ${recordsWithPrimary.rowIndex} ASC`,
  },
};
