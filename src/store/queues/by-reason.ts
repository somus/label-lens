import { and, asc, eq } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import { nonOrphan } from "./predicates.ts";
import type { QueueDefinition } from "./registry.ts";

export function byReason(value: string): QueueDefinition {
  if (value.length === 0) throw new Error("by-reason needs <reason>");
  return {
    id: `by-reason:${value}`,
    label: `Reason: ${value}`,
    query: {
      where: and(eq(recordsWithPrimary.primaryReason, value), nonOrphan()),
      orderBy: asc(recordsWithPrimary.rowIndex),
    },
  };
}
