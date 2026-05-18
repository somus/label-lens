import { and, asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import { nonOrphan, unreviewed } from "./predicates.ts";
import type { QueueDefinition } from "./registry.ts";

export const disagreements: QueueDefinition = {
  id: "disagreements",
  label: "Disagreements",
  query: {
    where: and(
      unreviewed(),
      sql`(
        SELECT COUNT(DISTINCT p.label) FROM predictions p
        WHERE p.record_id = ${recordsWithPrimary.id}
      ) > 1`,
      nonOrphan(),
    ),
    orderBy: asc(recordsWithPrimary.rowIndex),
  },
};
