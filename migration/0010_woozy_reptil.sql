ALTER TABLE `reviews` ADD `note` text;--> statement-breakpoint
DROP VIEW IF EXISTS `effective_reviews`;--> statement-breakpoint
CREATE VIEW `effective_reviews` AS
SELECT r.id                     AS id,
       r.record_id               AS record_id,
       r.status                  AS status,
       r.final_label             AS final_label,
       r.prev_label              AS prev_label,
       r.reviewed_at             AS reviewed_at,
       r.source_of_truth         AS source_of_truth,
       r.compensates_review_id   AS compensates_review_id,
       r.note                    AS note
FROM reviews r
WHERE r.status != 'undone'
  AND r.id NOT IN (
    SELECT compensates_review_id FROM reviews
    WHERE compensates_review_id IS NOT NULL
  );
