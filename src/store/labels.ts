import { sql } from "drizzle-orm";
import { type LabelConfigEntry, labelName } from "../config/config.ts";
import { decodeLabelSet } from "../labels/label-set.ts";
import type { TxOrDb } from "./db.ts";

export type UnknownLabel = { label: string; count: number };

/**
 * Labels that appear in current state — `predictions.label` or any
 * `effective_reviews` row — but are absent from the configured label set.
 * Reads the `effective_reviews` view (ADR 0007) so undone / compensated
 * audit rows don't trip the startup guard. `count` is the distinct number
 * of records touched.
 *
 * Multi-label storage packs sets as canonical JSON array text (`["a","b"]`).
 * Those rows are decoded and each element checked individually so an
 * unconfigured `harassment` flagged as part of `["toxicity","harassment"]`
 * surfaces as the missing element, not the whole set literal.
 */
export function findUnknownLabels(db: TxOrDb, configured: LabelConfigEntry[]): UnknownLabel[] {
  const allowed = new Set(configured.map(labelName));
  const rows = db.all<{ label: string; record_id: string }>(sql`
    SELECT label, record_id FROM predictions
    UNION ALL
    SELECT final_label AS label, record_id FROM effective_reviews WHERE final_label IS NOT NULL
    UNION ALL
    SELECT prev_label AS label, record_id FROM effective_reviews WHERE prev_label IS NOT NULL
  `);
  // Track distinct record_id per offending label so the count matches the
  // pre-multi-label behaviour (records touched, not raw row hits).
  const offenders = new Map<string, Set<string>>();
  for (const row of rows) {
    const text = row.label;
    if (text.startsWith("[")) {
      // Multi-label JSON array text. Empty arrays represent the valid
      // "no labels apply" decision under multi-label tasks; skip them.
      const decoded = decodeLabelSet(text);
      for (const element of decoded) {
        if (allowed.has(element)) continue;
        let set = offenders.get(element);
        if (!set) {
          set = new Set();
          offenders.set(element, set);
        }
        set.add(row.record_id);
      }
      continue;
    }
    if (allowed.has(text)) continue;
    let set = offenders.get(text);
    if (!set) {
      set = new Set();
      offenders.set(text, set);
    }
    set.add(row.record_id);
  }
  return [...offenders.entries()]
    .map(([label, ids]) => ({ label, count: ids.size }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
