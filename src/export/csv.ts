import type { OutputFieldOverrides } from "../config/config.ts";
import { validateExportLabelSet } from "../labels/label-set.ts";
import type { Db } from "../store/db.ts";
import { latestEffectiveByRecord, type QueueQuery, queueRecords } from "../store/queries.ts";
import { withOrphanFilter } from "./where.ts";

export type ExportCsvOptions = {
  query?: QueueQuery;
  includeRejected?: boolean;
  includeSkipped?: boolean;
  includeOrphans?: boolean;
  multiLabelSeparator?: string;
  /** When true, decode `final_label` as a JSON array text before joining. */
  multiLabel?: boolean;
  fieldOverrides?: OutputFieldOverrides;
};

// RFC 4180 CSV: fields containing comma, quote, or newline get quoted; embedded
// quotes are doubled. https://datatracker.ietf.org/doc/html/rfc4180
const NEEDS_QUOTE = /[",\r\n]/;

const DEFAULT_MULTI_LABEL_SEPARATOR = ";";

export function formatCsvLabel(
  label: string | string[] | null,
  separator = DEFAULT_MULTI_LABEL_SEPARATOR,
): string {
  if (label === null) return "";
  if (Array.isArray(label)) return label.join(separator);
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
  const reviewsByRecord = latestEffectiveByRecord(db);
  const separator = opts.multiLabelSeparator ?? DEFAULT_MULTI_LABEL_SEPARATOR;
  const overrides = opts.fieldOverrides ?? {};
  const data: CsvRow[] = [];
  for (const record of records) {
    const review = reviewsByRecord.get(record.id);
    if (!review) continue;
    const accepted = review.status === "accepted" || review.status === "relabeled";
    const rejected = review.status === "rejected";
    const skipped = review.status === "skipped";
    if (!accepted && !(rejected && opts.includeRejected) && !(skipped && opts.includeSkipped))
      continue;
    const labelValue = accepted
      ? opts.multiLabel
        ? formatCsvLabel(
            review.final_label === null
              ? null
              : validateExportLabelSet(review.final_label, record.id, { separator }),
            separator,
          )
        : formatCsvLabel(review.final_label, separator)
      : "";
    data.push({
      id: record.id,
      text: record.text,
      label: labelValue,
      reviewedAt: review.reviewed_at,
      documentId: record.document_id,
    });
  }
  const hasDocumentId = data.some((r) => r.documentId !== null);
  const headerCols = [
    overrides.id ?? "id",
    overrides.text ?? "text",
    overrides.label ?? "label",
    overrides.reviewed_at ?? "reviewed_at",
  ];
  if (hasDocumentId) headerCols.push(overrides.document_id ?? "document_id");
  const rows: string[] = [headerCols.join(",")];
  for (const r of data) {
    const cells = [csvField(r.id), csvField(r.text), csvField(r.label), csvField(r.reviewedAt)];
    if (hasDocumentId) cells.push(csvField(r.documentId ?? ""));
    rows.push(cells.join(","));
  }
  return `${rows.join("\r\n")}\r\n`;
}
