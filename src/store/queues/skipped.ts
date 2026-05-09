import { asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

export const skipped: QueueDefinition = {
  id: "skipped",
  label: "Skipped",
  query: {
    where: sql`EXISTS (
      SELECT 1 FROM reviews v
      WHERE v.record_id = ${recordsWithPrimary.id}
        AND v.status = 'skipped'
        AND v.id NOT IN (
          SELECT compensates_review_id FROM reviews
          WHERE compensates_review_id IS NOT NULL
        )
        AND v.id = (
          SELECT MAX(v2.id) FROM reviews v2
          WHERE v2.record_id = ${recordsWithPrimary.id}
            AND v2.status != 'undone'
            AND v2.id NOT IN (
              SELECT compensates_review_id FROM reviews
              WHERE compensates_review_id IS NOT NULL
            )
        )
    )`,
    orderBy: asc(recordsWithPrimary.rowIndex),
  },
};
