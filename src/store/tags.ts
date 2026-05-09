import { and, asc, eq } from "drizzle-orm";
import type { TxOrDb } from "./db.ts";
import { recordTags } from "./schema.ts";

export function hasTag(db: TxOrDb, recordId: string, tag: string): boolean {
  const row = db
    .select({ tag: recordTags.tag })
    .from(recordTags)
    .where(and(eq(recordTags.recordId, recordId), eq(recordTags.tag, tag)))
    .get();
  return row !== undefined;
}

export function tagsForRecord(db: TxOrDb, recordId: string): string[] {
  return db
    .select({ tag: recordTags.tag })
    .from(recordTags)
    .where(eq(recordTags.recordId, recordId))
    .orderBy(asc(recordTags.tag))
    .all()
    .map((r) => r.tag);
}

/** Toggle a tag on a record. Returns the new presence state (true = now tagged). */
export function toggleTag(db: TxOrDb, recordId: string, tag: string): boolean {
  if (hasTag(db, recordId, tag)) {
    db.delete(recordTags)
      .where(and(eq(recordTags.recordId, recordId), eq(recordTags.tag, tag)))
      .run();
    return false;
  }
  db.insert(recordTags).values({ recordId, tag, createdAt: new Date().toISOString() }).run();
  return true;
}
