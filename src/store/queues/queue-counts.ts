import { eq, sql } from "drizzle-orm";
import type { Db } from "../db.ts";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

export function queueCount(db: Db, def: QueueDefinition): number {
  let q = db.select({ n: sql<number>`COUNT(*)` }).from(recordsWithPrimary).$dynamic();
  if (def.query.where) q = q.where(def.query.where);
  return q.get()?.n ?? 0;
}

export function nonOrphanRecordCount(db: Db): number {
  return (
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(recordsWithPrimary)
      .where(eq(recordsWithPrimary.orphan, false))
      .get()?.n ?? 0
  );
}
