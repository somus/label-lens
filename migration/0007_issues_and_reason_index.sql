CREATE TABLE `issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`record_id` text NOT NULL,
	`type` text NOT NULL,
	`score` real,
	`source` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_issues_type` ON `issues` (`type`);--> statement-breakpoint
CREATE INDEX `idx_issues_record` ON `issues` (`record_id`);--> statement-breakpoint
CREATE INDEX `idx_predictions_reason` ON `predictions` (`reason`);
