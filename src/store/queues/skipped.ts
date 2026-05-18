import { and, asc } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import { latestEffectiveStatus, nonOrphan } from "./predicates.ts";
import type { QueueDefinition } from "./registry.ts";

export const skipped: QueueDefinition = {
  id: "skipped",
  label: "Skipped",
  query: {
    where: and(latestEffectiveStatus("skipped"), nonOrphan()),
    orderBy: asc(recordsWithPrimary.rowIndex),
  },
};
