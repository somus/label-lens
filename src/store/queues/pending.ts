import { and, asc } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import { nonOrphan, unreviewed } from "./predicates.ts";
import type { QueueDefinition } from "./registry.ts";

export const pending: QueueDefinition = {
  id: "pending",
  label: "Pending",
  query: {
    where: and(unreviewed(), nonOrphan()),
    orderBy: asc(recordsWithPrimary.rowIndex),
  },
};
