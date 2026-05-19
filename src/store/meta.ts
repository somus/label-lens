import { eq } from "drizzle-orm";
import type { TxOrDb } from "./db.ts";
import { meta } from "./schema.ts";

export function getMeta(db: TxOrDb, key: string): string | null {
  const row = db.select().from(meta).where(eq(meta.key, key)).get();
  return row?.value ?? null;
}

export function setMeta(db: TxOrDb, key: string, value: string): void {
  db.insert(meta)
    .values({ key, value })
    .onConflictDoUpdate({ target: meta.key, set: { value } })
    .run();
}
