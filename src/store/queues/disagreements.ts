import { asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

export const disagreements: QueueDefinition = {
  id: "disagreements",
  label: "Disagreements",
  query: {
    where: sql`NOT EXISTS (
      SELECT 1 FROM effective_reviews er
      WHERE er.record_id = ${recordsWithPrimary.id}
    ) AND (
      SELECT COUNT(DISTINCT p.label) FROM predictions p
      WHERE p.record_id = ${recordsWithPrimary.id}
    ) > 1`,
    orderBy: asc(recordsWithPrimary.rowIndex),
  },
};
