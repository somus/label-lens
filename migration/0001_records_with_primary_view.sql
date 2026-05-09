-- records_with_primary: every record joined to its primary prediction.
-- Primary = highest confidence; NULL confidence loses to any numeric;
-- ties broken by predictions.id ASC (insertion order). PRD §11.4 + ADR 0001.
CREATE VIEW IF NOT EXISTS `records_with_primary` AS
SELECT
  r.id              AS id,
  r.source_path     AS source_path,
  r.row_index       AS row_index,
  r.text            AS text,
  r.context_before  AS context_before,
  r.context_after   AS context_after,
  r.raw             AS raw,
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
