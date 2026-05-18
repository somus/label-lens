import { and, asc, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import { nonOrphan, unreviewed } from "./predicates.ts";
import type { QueueDefinition } from "./registry.ts";

export const lowConfidence: QueueDefinition = {
  id: "low-confidence",
  label: "Low confidence",
  query: {
    where: and(unreviewed(), nonOrphan()),
    // NULL confidences sort last so reviewers see the model's lowest scores first.
    orderBy: sql`(${recordsWithPrimary.primaryConfidence} IS NULL), ${asc(recordsWithPrimary.primaryConfidence)}, ${asc(recordsWithPrimary.rowIndex)}`,
  },
};
