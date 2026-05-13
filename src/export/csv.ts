import type { Db } from "../store/db.ts";
import { currentReview, type QueueQuery, queueRecords } from "../store/queries.ts";
import { withOrphanFilter } from "./where.ts";

export type ExportCsvOptions = {
  query?: QueueQuery;
  includeRejected?: boolean;
  includeOrphans?: boolean;
};

const NEEDS_QUOTE = /[",\r\n]/;

const MULTI_LABEL_SEPARATOR = ";";

export function formatCsvLabel(label: string | string[] | null): string {
  if (label === null) return "";
  if (Array.isArray(label)) return label.join(MULTI_LABEL_SEPARATOR);
  return label;
}

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (NEEDS_QUOTE.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

type CsvRow = {
  id: string;
  text: string;
  label: string;
  reviewedAt: string;
  documentId: string | null;
};

export function exportCsvString(db: Db, opts: ExportCsvOptions = {}): string {
  const query = withOrphanFilter(opts.query, opts.includeOrphans ?? false);
  const records = queueRecords(db, query);
  const data: CsvRow[] = [];
  for (const record of records) {
    const review = currentReview(db, record.id);
    if (!review) continue;
    const accepted = review.status === "accepted" || review.status === "relabeled";
    const rejected = review.status === "rejected";
    if (!accepted && !(rejected && opts.includeRejected)) continue;
    data.push({
      id: record.id,
      text: record.text,
      label: formatCsvLabel(review.final_label),
      reviewedAt: review.reviewed_at,
      documentId: record.document_id,
    });
  }
  const hasDocumentId = data.some((r) => r.documentId !== null);
  const headerCols = ["id", "text", "label", "reviewed_at"];
  if (hasDocumentId) headerCols.push("document_id");
  const rows: string[] = [headerCols.join(",")];
  for (const r of data) {
    const cells = [csvField(r.id), csvField(r.text), csvField(r.label), csvField(r.reviewedAt)];
    if (hasDocumentId) cells.push(csvField(r.documentId ?? ""));
    rows.push(cells.join(","));
  }
  return `${rows.join("\r\n")}\r\n`;
}
