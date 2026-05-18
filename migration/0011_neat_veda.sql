CREATE TABLE `assistant_queries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`record_id` text NOT NULL,
	`prompt_hash` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_assistant_queries_record_hash` ON `assistant_queries` (`record_id`,`prompt_hash`);--> statement-breakpoint
CREATE INDEX `idx_assistant_queries_created` ON `assistant_queries` (`created_at`);