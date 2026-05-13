import { asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

export const skipped: QueueDefinition = {
  id: "skipped",
  label: "Skipped",
  query: {
    where: sql`(
      SELECT er.status FROM effective_reviews er
      WHERE er.record_id = ${recordsWithPrimary.id}
      ORDER BY er.id DESC LIMIT 1
    ) = 'skipped' AND ${recordsWithPrimary.orphan} = 0`,
    orderBy: asc(recordsWithPrimary.rowIndex),
  },
};
