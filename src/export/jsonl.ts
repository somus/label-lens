import type { Db } from "../store/db.ts";
import { latestEffectiveByRecord, type QueueQuery, queueRecords } from "../store/queries.ts";
import { projectMeta } from "./meta.ts";
import { withOrphanFilter } from "./where.ts";

export type ExportJsonlOptions = {
  query?: QueueQuery;
  includeRejected?: boolean;
  includeOrphans?: boolean;
};

export function exportJsonlString(db: Db, opts: ExportJsonlOptions = {}): string {
  const query = withOrphanFilter(opts.query, opts.includeOrphans ?? false);
  const records = queueRecords(db, query);
  const reviewsByRecord = latestEffectiveByRecord(db);
  const lines: string[] = [];
  for (const record of records) {
    const review = reviewsByRecord.get(record.id);
    if (!review) continue;
    const accepted = review.status === "accepted" || review.status === "relabeled";
    const rejected = review.status === "rejected";
    if (!accepted && !(rejected && opts.includeRejected)) continue;
    const meta = projectMeta(record.raw);
    const row: Record<string, unknown> = {
      id: record.id,
      text: record.text,
      label: review.final_label,
      reviewed_at: review.reviewed_at,
    };
    if (record.document_id !== null) row.document_id = record.document_id;
    if (meta) row.meta = meta;
    lines.push(JSON.stringify(row));
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}
