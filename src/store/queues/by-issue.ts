import { and, asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import { nonOrphan } from "./predicates.ts";
import type { QueueDefinition } from "./registry.ts";

export function byIssue(type: string): QueueDefinition {
  if (type.length === 0) throw new Error("by-issue needs <type>");
  return {
    id: `by-issue:${type}`,
    label: `Issue: ${type}`,
    query: {
      where: and(
        sql`EXISTS (
          SELECT 1 FROM issues i
          WHERE i.record_id = ${recordsWithPrimary.id} AND i.type = ${type}
        )`,
        nonOrphan(),
      ),
      orderBy: asc(recordsWithPrimary.rowIndex),
    },
  };
}
