import { asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

export const lowConfidence: QueueDefinition = {
  id: "low-confidence",
  label: "Low confidence",
  query: {
    where: sql`NOT EXISTS (
      SELECT 1 FROM effective_reviews er
      WHERE er.record_id = ${recordsWithPrimary.id}
    )`,
    // NULL confidences sort last so reviewers see the model's lowest scores first.
    orderBy: sql`(${recordsWithPrimary.primaryConfidence} IS NULL), ${asc(recordsWithPrimary.primaryConfidence)}, ${asc(recordsWithPrimary.rowIndex)}`,
  },
};
