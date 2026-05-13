import { sql } from "drizzle-orm";
import { type LabelConfigEntry, labelName } from "../config/config.ts";
import type { TxOrDb } from "./db.ts";

export type UnknownLabel = { label: string; count: number };

/**
 * Labels that appear in current state — `predictions.label` or any
 * `effective_reviews` row — but are absent from the configured label set.
 * Reads the `effective_reviews` view (ADR 0007) so undone / compensated
 * audit rows don't trip the startup guard. `count` is the distinct number
 * of records touched.
 */
export function findUnknownLabels(db: TxOrDb, configured: LabelConfigEntry[]): UnknownLabel[] {
  const allowed = new Set(configured.map(labelName));
  const rows = db.all<{ label: string; count: number }>(sql`
    SELECT label, COUNT(DISTINCT record_id) AS count FROM (
      SELECT label, record_id FROM predictions
      UNION ALL
      SELECT final_label AS label, record_id FROM effective_reviews WHERE final_label IS NOT NULL
      UNION ALL
      SELECT prev_label AS label, record_id FROM effective_reviews WHERE prev_label IS NOT NULL
    )
    GROUP BY label
    ORDER BY label
  `);
  return rows.filter((r) => !allowed.has(r.label));
}
