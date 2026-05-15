import { sql } from "drizzle-orm";
import type { Db } from "../store/db.ts";

/**
 * Sidebar data snapshot. Computed once per refresh trigger
 * (queue switch, review commit, mark toggle, screen entry) by the AppContext
 * mutators in `app/context.ts`. Sidebar renderer is a pure consumer.
 *
 * Two modes:
 *   - `queue` — for the review screen. Carries current queue position +
 *     session counters + queue progress + per-type signal counts.
 *   - `stats` — for the stats screen. Replaces counters/progress/signals with
 *     a totals block (Total / Reviewed / Pending / Accepted / Relabeled /
 *     Rejected / Skipped).
 */

export type SidebarSignalRow = { type: string; count: number };

export type SidebarQueueData = {
  mode: "queue";
  queueLabel: string;
  queuePosition: number;
  queueTotal: number;
  datasetPath: string;
  counters: { reviewed: number; skipped: number; marked: number };
  queueProgress: { reviewed: number; total: number };
  signals: SidebarSignalRow[];
  smartNext: boolean;
};

export type SidebarStatsData = {
  mode: "stats";
  datasetPath: string;
  totals: {
    total: number;
    reviewed: number;
    pending: number;
    accepted: number;
    relabeled: number;
    rejected: number;
    skipped: number;
  };
};

export type SidebarData = SidebarQueueData | SidebarStatsData;

/**
 * Per-queue signal counts. Returns rows for signal types with >0 hits in the
 * given record-id scope. Empty array means no signals — sidebar renders
 * `None` placeholder in that case.
 *
 * Pass `null` for `recordIds` to count signals across the full dataset
 * (used by `pending` queue + any non-scoped read).
 *
 * Precondition: `recordIds` must originate from internal sources (e.g.
 * `Cursor.rowIds()` / queue resolution) — never from raw user input. Values
 * are parameter-bound via drizzle so SQL injection is not the concern; the
 * contract here is that callers vouch for the ID set having been produced
 * by the store, so unbounded IN-clause sizes and arbitrary strings are not
 * possible.
 */
export function signalCounts(db: Db, recordIds: string[] | null): SidebarSignalRow[] {
  if (recordIds !== null && recordIds.length === 0) return [];
  const rows = db.all<{ type: string; n: number }>(
    recordIds === null
      ? sql`SELECT type, COUNT(*) AS n FROM issues GROUP BY type ORDER BY n DESC`
      : sql`SELECT type, COUNT(*) AS n FROM issues WHERE record_id IN (${sql.join(
          recordIds.map((id) => sql`${id}`),
          sql`, `,
        )}) GROUP BY type ORDER BY n DESC`,
  );
  return rows.filter((r) => r.n > 0).map((r) => ({ type: r.type, count: r.n }));
}

/**
 * Queue progress: reviewed / total. Reviewed = records in the queue scope
 * with any effective review entry. Uses the `effective_reviews` view per
 * ADR 0007.
 *
 * Precondition: `recordIds` must come from internal sources (see
 * `signalCounts`). Same trust contract.
 */
export function queueProgress(
  db: Db,
  recordIds: string[] | null,
  queueTotal: number,
): { reviewed: number; total: number } {
  if (queueTotal === 0) return { reviewed: 0, total: 0 };
  if (recordIds !== null && recordIds.length === 0) return { reviewed: 0, total: queueTotal };
  const rows = db.all<{ n: number }>(
    recordIds === null
      ? sql`SELECT COUNT(*) AS n FROM effective_reviews`
      : sql`SELECT COUNT(*) AS n FROM effective_reviews WHERE record_id IN (${sql.join(
          recordIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
  );
  return { reviewed: rows[0]?.n ?? 0, total: queueTotal };
}

/**
 * Dataset-wide totals for the stats sidebar. Mirrors progressCounts shape.
 *
 * Known review statuses: `accepted`, `relabeled`, `rejected`, `skipped` (plus
 * `undone` / `pending` which never appear in `effective_reviews` per ADR 0007).
 * Any unknown status returned by the GROUP BY is silently ignored — schema
 * additions should extend the destructuring below to surface in the sidebar.
 */
export function statsTotals(db: Db): SidebarStatsData["totals"] {
  const total =
    db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM records WHERE orphan = 0`)[0]?.n ?? 0;
  const byStatus = db.all<{ status: string; n: number }>(
    sql`SELECT status, COUNT(*) AS n FROM effective_reviews GROUP BY status`,
  );
  const counts: Record<string, number> = {};
  for (const row of byStatus) counts[row.status] = row.n;
  const accepted = counts.accepted ?? 0;
  const relabeled = counts.relabeled ?? 0;
  const rejected = counts.rejected ?? 0;
  const skipped = counts.skipped ?? 0;
  const reviewed = accepted + relabeled + rejected;
  const pending = Math.max(0, total - reviewed - skipped);
  return { total, reviewed, pending, accepted, relabeled, rejected, skipped };
}
