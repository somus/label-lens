import { eq, type SQL, sql } from "drizzle-orm";
import { recordsWithPrimary } from "../schema.ts";

// Excludes orphans (re-ingest survivors whose hash no longer matches). Every
// built-in Queue except `orphans` composes this; the `where:` DSL applies it
// by default (escape via `include-orphans:`). See CONTEXT.md (orphan).
export function nonOrphan(): SQL {
  return eq(recordsWithPrimary.orphan, false);
}

// "No effective review for this record." Used by Queues that show records the
// reviewer hasn't acted on (pending, smart-pending, low-confidence,
// disagreements). `flagged`/`marked` deliberately omit this because Tag and
// Issue are orthogonal to Review state.
export function unreviewed(): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM effective_reviews er
    WHERE er.record_id = ${recordsWithPrimary.id}
  )`;
}

// Latest non-undone, non-compensated review's status equals `status`. The
// LIMIT 1 picks the most recent of those per record (ADR 0007).
export function latestEffectiveStatus(status: string): SQL {
  return sql`(
    SELECT er.status FROM effective_reviews er
    WHERE er.record_id = ${recordsWithPrimary.id}
    ORDER BY er.id DESC LIMIT 1
  ) = ${status}`;
}

// Latest non-undone, non-compensated review's `final_label` equals `label`.
// NULL final_label (rejected) intentionally does not match.
export function latestEffectiveFinalLabel(label: string): SQL {
  return sql`(
    SELECT er.final_label FROM effective_reviews er
    WHERE er.record_id = ${recordsWithPrimary.id}
    ORDER BY er.id DESC LIMIT 1
  ) = ${label}`;
}
