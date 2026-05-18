import { and, asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import { nonOrphan } from "./predicates.ts";
import type { QueueDefinition } from "./registry.ts";

export const flagged: QueueDefinition = {
  id: "flagged",
  label: "Flagged",
  query: {
    where: and(
      sql`EXISTS (
        SELECT 1 FROM issues i
        WHERE i.record_id = ${recordsWithPrimary.id}
      )`,
      nonOrphan(),
    ),
    orderBy: asc(recordsWithPrimary.rowIndex),
  },
};
