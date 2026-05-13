import { asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

export const marked: QueueDefinition = {
  id: "marked",
  label: "Marked",
  query: {
    where: sql`EXISTS (
      SELECT 1 FROM record_tags rt
      WHERE rt.record_id = ${recordsWithPrimary.id} AND rt.tag = 'marked'
    ) AND ${recordsWithPrimary.orphan} = 0`,
    orderBy: asc(recordsWithPrimary.rowIndex),
  },
};
