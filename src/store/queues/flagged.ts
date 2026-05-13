import { asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

export const flagged: QueueDefinition = {
  id: "flagged",
  label: "Flagged",
  query: {
    where: sql`EXISTS (
      SELECT 1 FROM issues i
      WHERE i.record_id = ${recordsWithPrimary.id}
    ) AND ${recordsWithPrimary.orphan} = 0`,
    orderBy: asc(recordsWithPrimary.rowIndex),
  },
};
