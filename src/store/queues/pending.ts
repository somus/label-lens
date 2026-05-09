import { asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

export const pending: QueueDefinition = {
  id: "pending",
  label: "Pending",
  query: {
    where: sql`NOT EXISTS (
      SELECT 1 FROM reviews v
      WHERE v.record_id = ${recordsWithPrimary.id}
        AND v.status != 'undone'
        AND v.id NOT IN (
          SELECT compensates_review_id FROM reviews
          WHERE compensates_review_id IS NOT NULL
        )
    )`,
    orderBy: asc(recordsWithPrimary.rowIndex),
  },
};
