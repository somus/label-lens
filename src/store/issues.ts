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

// SQLite hard-caps a single statement at 999 bind parameters by default. Each
// issues row binds 5 columns, so a 100-row chunk uses 500 params — comfortably
// under the limit and keeps statement size predictable.
const ISSUES_INSERT_CHUNK = 100;

export function insertComputedIssues(db: TxOrDb, rows: ComputedIssueInput[]): void {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += ISSUES_INSERT_CHUNK) {
    const chunk = rows.slice(i, i + ISSUES_INSERT_CHUNK).map((r) => ({
      recordId: r.recordId,
      type: r.type,
      score: r.score,
      source: COMPUTED_SIGNAL_SOURCE,
      createdAt: now,
    }));
    db.insert(issues).values(chunk).run();
  }
}

export function issuesForRecord(db: TxOrDb, recordId: string): StoredIssue[] {
  return db.select().from(issues).where(eq(issues.recordId, recordId)).all();
}

export function purgeComputedIssues(db: TxOrDb): void {
  db.delete(issues).where(eq(issues.source, COMPUTED_SIGNAL_SOURCE)).run();
}
