ALTER TABLE `reviews` ADD `batch_id` text;--> statement-breakpoint
CREATE INDEX `idx_reviews_batch` ON `reviews` (`batch_id`);--> statement-breakpoint
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
       r.note                    AS note,
       r.batch_id                AS batch_id
FROM reviews r
WHERE r.status != 'undone'
  AND r.id NOT IN (
    SELECT compensates_review_id FROM reviews
    WHERE compensates_review_id IS NOT NULL
  );
