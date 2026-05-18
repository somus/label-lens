import { and, asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import { nonOrphan } from "./predicates.ts";
import type { QueueDefinition } from "./registry.ts";

export const marked: QueueDefinition = {
  id: "marked",
  label: "Marked",
  query: {
    where: and(
      sql`EXISTS (
        SELECT 1 FROM record_tags rt
        WHERE rt.record_id = ${recordsWithPrimary.id} AND rt.tag = 'marked'
      )`,
      nonOrphan(),
    ),
    orderBy: asc(recordsWithPrimary.rowIndex),
  },
};
