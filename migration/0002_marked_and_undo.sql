CREATE TABLE `record_tags` (
	`record_id` text NOT NULL,
	`tag` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`record_id`, `tag`),
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_record_tags_tag` ON `record_tags` (`tag`);--> statement-breakpoint
ALTER TABLE `reviews` ADD `compensates_review_id` integer REFERENCES reviews(id);--> statement-breakpoint
CREATE INDEX `idx_reviews_compensates` ON `reviews` (`compensates_review_id`);