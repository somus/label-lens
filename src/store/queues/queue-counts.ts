import { sql } from "drizzle-orm";
import type { Db } from "../db.ts";
import { recordsWithPrimary } from "../schema.ts";
import type { QueueDefinition } from "./registry.ts";

export function queueCount(db: Db, def: QueueDefinition): number {
  let q = db.select({ n: sql<number>`COUNT(*)` }).from(recordsWithPrimary).$dynamic();
  if (def.query.where) q = q.where(def.query.where);
  return q.get()?.n ?? 0;
}
