import { eq } from "drizzle-orm";
import type { TxOrDb } from "./db.ts";
import { issues } from "./schema.ts";

export const COMPUTED_SIGNAL_SOURCE = "computed";

export type ComputedIssueInput = {
  recordId: string;
  type: string;
  score: number | null;
};

export type StoredIssue = {
  id: number;
  recordId: string;
  type: string;
  score: number | null;
  source: string | null;
  createdAt: string;
};

export function insertComputedIssues(db: TxOrDb, rows: ComputedIssueInput[]): void {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  for (const r of rows) {
    db.insert(issues)
      .values({
        recordId: r.recordId,
        type: r.type,
        score: r.score,
        source: COMPUTED_SIGNAL_SOURCE,
        createdAt: now,
      })
      .run();
  }
}

export function issuesForRecord(db: TxOrDb, recordId: string): StoredIssue[] {
  return db.select().from(issues).where(eq(issues.recordId, recordId)).all();
}

export function purgeComputedIssues(db: TxOrDb): void {
  db.delete(issues).where(eq(issues.source, COMPUTED_SIGNAL_SOURCE)).run();
}
