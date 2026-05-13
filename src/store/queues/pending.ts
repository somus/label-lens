import { asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

export const pending: QueueDefinition = {
  id: "pending",
  label: "Pending",
  query: {
    where: sql`NOT EXISTS (
      SELECT 1 FROM effective_reviews er
      WHERE er.record_id = ${recordsWithPrimary.id}
    ) AND ${recordsWithPrimary.orphan} = 0`,
    orderBy: asc(recordsWithPrimary.rowIndex),
  },
};
