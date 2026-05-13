import { asc, eq } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

/**
 * Records that were superseded by a re-ingest with changed text/context.
 * Their predictions, reviews, and tags are preserved. ADR 0002 + PRD §13.
 */
export const orphans: QueueDefinition = {
  id: "orphans",
  label: "Orphans",
  query: {
    where: eq(recordsWithPrimary.orphan, true),
    orderBy: asc(recordsWithPrimary.rowIndex),
  },
};
