CREATE TABLE `_sync_state` (
	`table_name` text PRIMARY KEY NOT NULL,
	`last_pull_server_ts` text,
	`last_push_at` integer,
	`last_pull_at` integer
);
--> statement-breakpoint
ALTER TABLE `chunks` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `chunks` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `fsrs_params` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `fsrs_params` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `gen_cache` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `jol` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `receipts` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `sources` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `turns` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `gen_cache` SET `updated_at` = `created_at` WHERE `updated_at` = 0;--> statement-breakpoint
UPDATE `jol` SET `updated_at` = `created_at` WHERE `updated_at` = 0;--> statement-breakpoint
UPDATE `receipts` SET `updated_at` = `created_at` WHERE `updated_at` = 0;--> statement-breakpoint
UPDATE `sessions` SET `updated_at` = COALESCE(`ended_at`, `started_at`) WHERE `updated_at` = 0;--> statement-breakpoint
UPDATE `sources` SET `updated_at` = `created_at` WHERE `updated_at` = 0;--> statement-breakpoint
UPDATE `turns` SET `updated_at` = `created_at` WHERE `updated_at` = 0;
