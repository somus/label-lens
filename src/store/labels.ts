import { sql } from "drizzle-orm";
import { type LabelConfigEntry, labelName } from "../config/config.ts";
import type { TxOrDb } from "./db.ts";

export type UnknownLabel = { label: string; count: number };

/**
 * Return labels that appear in `predictions.label`, `reviews.final_label`, or
 * `reviews.prev_label` but are not present in the configured label set.
 * `count` is the distinct number of records touched by the unknown label.
 */
export function findUnknownLabels(db: TxOrDb, configured: LabelConfigEntry[]): UnknownLabel[] {
  const allowed = new Set(configured.map(labelName));
  const rows = db.all<{ label: string; count: number }>(sql`
    SELECT label, COUNT(DISTINCT record_id) AS count FROM (
      SELECT label, record_id FROM predictions
      UNION ALL
      SELECT final_label AS label, record_id FROM reviews WHERE final_label IS NOT NULL
      UNION ALL
      SELECT prev_label AS label, record_id FROM reviews WHERE prev_label IS NOT NULL
    )
    GROUP BY label
    ORDER BY label
  `);
  return rows.filter((r) => !allowed.has(r.label));
}
