CREATE TABLE `predictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`record_id` text NOT NULL,
	`label` text NOT NULL,
	`confidence` real,
	`source` text NOT NULL,
	`reason` text,
	`raw` text NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_predictions_record` ON `predictions` (`record_id`);--> statement-breakpoint
CREATE INDEX `idx_predictions_source` ON `predictions` (`source`);--> statement-breakpoint
CREATE INDEX `idx_predictions_conf` ON `predictions` (`confidence`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`source_path` text NOT NULL,
	`row_index` integer NOT NULL,
	`text` text NOT NULL,
	`context_before` text,
	`context_after` text,
	`raw` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`record_id` text NOT NULL,
	`status` text NOT NULL,
	`final_label` text,
	`prev_label` text,
	`note` text,
	`reviewed_at` text NOT NULL,
	`source_of_truth` text NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_reviews_record` ON `reviews` (`record_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_status` ON `reviews` (`status`);--> statement-breakpoint
CREATE INDEX `idx_reviews_final` ON `reviews` (`final_label`);--> statement-breakpoint
CREATE INDEX `idx_reviews_prev` ON `reviews` (`prev_label`);