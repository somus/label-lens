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
// Rejected reviews carry NULL `final_label`; SQL's `NULL = <literal>` is NULL
// (not true), so rejected records correctly fail to match.
export function latestEffectiveFinalLabel(label: string): SQL {
  return sql`(
    SELECT er.final_label FROM effective_reviews er
    WHERE er.record_id = ${recordsWithPrimary.id}
    ORDER BY er.id DESC LIMIT 1
  ) = ${label}`;
}

// Set-membership variant for multi-label tasks. Latest effective review's
// `final_label` is a JSON array text; matches when `label` appears in the
// set. Scalar single-label data isn't a JSON array, so the
// `CASE WHEN json_valid... THEN x ELSE '[]' END` guard keeps `json_each`
// from erroring on bareword text — the empty array yields no rows and the
// branch contributes nothing under single-label storage.
export function latestEffectiveFinalLabelContains(label: string): SQL {
  return sql`EXISTS (
    SELECT 1 FROM json_each(CASE
      WHEN json_valid((
        SELECT er.final_label FROM effective_reviews er
        WHERE er.record_id = ${recordsWithPrimary.id}
        ORDER BY er.id DESC LIMIT 1
      )) THEN (
        SELECT er.final_label FROM effective_reviews er
        WHERE er.record_id = ${recordsWithPrimary.id}
        ORDER BY er.id DESC LIMIT 1
      )
      ELSE '[]'
    END)
    WHERE json_each.value = ${label}
  )`;
}

// Set-membership check on records_with_primary.primary_label JSON array
// text. Used by `by-label:<l>` to match unreviewed multi-label records
// whose Prediction set contains `<l>`. Scalar primary labels short-circuit
// via the empty-array guard, same as the review variant above.
export function primaryLabelContains(label: string): SQL {
  return sql`EXISTS (
    SELECT 1 FROM json_each(CASE
      WHEN json_valid(${recordsWithPrimary.primaryLabel}) THEN ${recordsWithPrimary.primaryLabel}
      ELSE '[]'
    END)
    WHERE json_each.value = ${label}
  )`;
}
