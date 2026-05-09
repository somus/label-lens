ALTER TABLE `records` ADD `note` text;--> statement-breakpoint
DROP VIEW IF EXISTS `records_with_primary`;--> statement-breakpoint
CREATE VIEW `records_with_primary` AS
SELECT
  r.id              AS id,
  r.source_path     AS source_path,
  r.row_index       AS row_index,
  r.text            AS text,
  r.context_before  AS context_before,
  r.context_after   AS context_after,
  r.raw             AS raw,
  r.note            AS note,
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
