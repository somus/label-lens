import { and, asc, eq } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

export function bySource(value: string): QueueDefinition {
  if (value.length === 0) throw new Error("by-source needs <source>");
  return {
    id: `by-source:${value}`,
    label: `Source: ${value}`,
    query: {
      where: and(eq(recordsWithPrimary.primarySource, value), eq(recordsWithPrimary.orphan, false)),
      orderBy: asc(recordsWithPrimary.rowIndex),
    },
  };
}
