-- records_with_primary v3: adds orphan column threaded from records.orphan.
-- Built-in queues (everything except the new `orphans` queue) AND `orphan = 0`
-- into their where clauses; the column needs to be visible on the view so
-- queries can reference it via drizzle column refs. Slice 9 / ADR 0002.
--
-- Mirrors 0006_records_with_primary_v2_doc_id.sql — view-rebuild pattern is
-- DROP + CREATE; no other view depends on records_with_primary.
DROP VIEW IF EXISTS `records_with_primary`;
--> statement-breakpoint
CREATE VIEW IF NOT EXISTS `records_with_primary` AS
SELECT
  r.id              AS id,
  r.source_path     AS source_path,
  r.row_index       AS row_index,
  r.text            AS text,
  r.context_before  AS context_before,
  r.context_after   AS context_after,
  r.raw             AS raw,
  r.note            AS note,
  r.orphan          AS orphan,
  COALESCE(
    json_extract(r.raw, '$.document_id'),
    json_extract(r.raw, '$.meta.document_id'),
    json_extract(r.raw, '$.meta.doc')
  )                 AS document_id,
  p.id              AS primary_prediction_id,
  p.label           AS primary_label,
  p.confidence      AS primary_confidence,
  p.source          AS primary_source,
  p.reason          AS primary_reason,
  p.raw             AS primary_raw
FROM records r
LEFT JOIN (
  SELECT
    record_id,
    id,
    label,
    confidence,
    source,
    reason,
    raw,
    ROW_NUMBER() OVER (
      PARTITION BY record_id
      ORDER BY (confidence IS NULL), confidence DESC, id ASC
    ) AS rn
  FROM predictions
) p ON p.record_id = r.id AND p.rn = 1;
