import type { OutputFieldOverrides } from "../config/config.ts";
import type { Db } from "../store/db.ts";
import { latestEffectiveByRecord, type QueueQuery, queueRecords } from "../store/queries.ts";
import { projectMeta } from "./meta.ts";
import { withOrphanFilter } from "./where.ts";

export type ExportJsonlOptions = {
  query?: QueueQuery;
  includeRejected?: boolean;
  includeSkipped?: boolean;
  includeOrphans?: boolean;
  fieldOverrides?: OutputFieldOverrides;
};

export function exportJsonlString(db: Db, opts: ExportJsonlOptions = {}): string {
  const query = withOrphanFilter(opts.query, opts.includeOrphans ?? false);
  const records = queueRecords(db, query);
  const reviewsByRecord = latestEffectiveByRecord(db);
  const o = opts.fieldOverrides ?? {};
  const keys = {
    id: o.id ?? "id",
    text: o.text ?? "text",
    label: o.label ?? "label",
    reviewed_at: o.reviewed_at ?? "reviewed_at",
    document_id: o.document_id ?? "document_id",
  };
  const lines: string[] = [];
  for (const record of records) {
    const review = reviewsByRecord.get(record.id);
    if (!review) continue;
    const accepted = review.status === "accepted" || review.status === "relabeled";
    const rejected = review.status === "rejected";
    const skipped = review.status === "skipped";
    if (!accepted && !(rejected && opts.includeRejected) && !(skipped && opts.includeSkipped))
      continue;
    const meta = projectMeta(record.raw);
    const row: Record<string, unknown> = {
      [keys.id]: record.id,
      [keys.text]: record.text,
      [keys.label]: accepted ? review.final_label : null,
      [keys.reviewed_at]: review.reviewed_at,
    };
    if (record.document_id !== null) row[keys.document_id] = record.document_id;
    if (meta) row.meta = meta;
    lines.push(JSON.stringify(row));
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}
