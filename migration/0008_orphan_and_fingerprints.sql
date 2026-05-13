CREATE TABLE `ingest_fingerprints` (
	`source_path` text PRIMARY KEY NOT NULL,
	`mtime` text NOT NULL,
	`content_sha256` text NOT NULL,
	`ingested_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `records` ADD `orphan` integer DEFAULT false NOT NULL;
