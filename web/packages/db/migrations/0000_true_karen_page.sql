CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`item_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`state` integer DEFAULT 0 NOT NULL,
	`due` integer NOT NULL,
	`last_review` integer,
	`stability` real DEFAULT 0 NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`scheduled_days` integer DEFAULT 0 NOT NULL,
	`learning_steps` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`suspended` integer DEFAULT 0 NOT NULL,
	`provisional` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cards_course_due` ON `cards` (`course_id`,`due`);--> statement-breakpoint
CREATE INDEX `cards_item` ON `cards` (`course_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`heading_path` text NOT NULL,
	`page_start` integer,
	`page_end` integer,
	`text` text NOT NULL,
	`token_count` integer NOT NULL,
	`hash` text NOT NULL,
	`embedding` blob
);
--> statement-breakpoint
CREATE INDEX `chunks_source` ON `chunks` (`source_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `concept_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`curriculum_id` text NOT NULL,
	`curriculum_version` integer NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`kind` text NOT NULL,
	`weight` real,
	`justification` text,
	`confidence` real
);
--> statement-breakpoint
CREATE INDEX `edges_curr` ON `concept_edges` (`curriculum_id`,`curriculum_version`);--> statement-breakpoint
CREATE TABLE `concept_state` (
	`course_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`mastery` real DEFAULT 0 NOT NULL,
	`successful_sessions` integer DEFAULT 0 NOT NULL,
	`last_success_day` text,
	`misconceptions_json` text DEFAULT '[]' NOT NULL,
	`assisted_pass` integer DEFAULT 0 NOT NULL,
	`assisted_n` integer DEFAULT 0 NOT NULL,
	`unassisted_pass` integer DEFAULT 0 NOT NULL,
	`unassisted_n` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`course_id`, `concept_id`)
);
--> statement-breakpoint
CREATE TABLE `concepts` (
	`id` text PRIMARY KEY NOT NULL,
	`curriculum_id` text NOT NULL,
	`curriculum_version` integer NOT NULL,
	`unit_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`name` text NOT NULL,
	`json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `concepts_curr` ON `concepts` (`curriculum_id`,`curriculum_version`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`curriculum_id` text NOT NULL,
	`curriculum_version` integer NOT NULL,
	`title` text NOT NULL,
	`goals_json` text NOT NULL,
	`settings_json` text NOT NULL,
	`scaffolding` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `curricula` (
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`subject` text NOT NULL,
	`content_hash` text NOT NULL,
	`manifest_json` text NOT NULL,
	`curriculum_json` text NOT NULL,
	`frozen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	PRIMARY KEY(`id`, `version`)
);
--> statement-breakpoint
CREATE TABLE `fsrs_params` (
	`course_id` text PRIMARY KEY NOT NULL,
	`w_json` text NOT NULL,
	`desired_retention` real NOT NULL,
	`optimized_at` integer,
	`n_reviews` integer DEFAULT 0 NOT NULL,
	`logloss` real
);
--> statement-breakpoint
CREATE TABLE `gen_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`concept_id` text NOT NULL,
	`curriculum_id` text NOT NULL,
	`curriculum_version` integer NOT NULL,
	`type` text NOT NULL,
	`bloom` text NOT NULL,
	`hash` text NOT NULL,
	`json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `items_concept` ON `items` (`concept_id`);--> statement-breakpoint
CREATE TABLE `jol` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`course_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`predicted_recall` real NOT NULL,
	`actual_outcome` integer,
	`checked_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `llm_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`course_id` text,
	`role` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`cache_read` integer DEFAULT 0 NOT NULL,
	`cache_write` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer NOT NULL,
	`cost_usd` real NOT NULL,
	`latency_ms` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `llm_calls_created` ON `llm_calls` (`created_at`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`op` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`course_id` text NOT NULL,
	`item_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`answer` text NOT NULL,
	`confidence` integer,
	`grade_json` text,
	`rating` integer NOT NULL,
	`assisted` integer DEFAULT 0 NOT NULL,
	`disputed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `receipts_course` ON `receipts` (`course_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `review_log` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`course_id` text NOT NULL,
	`review_time` integer NOT NULL,
	`rating` integer NOT NULL,
	`state_before` integer NOT NULL,
	`elapsed_days` integer NOT NULL,
	`scheduled_days` integer NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`duration_ms` integer,
	`confidence` integer,
	`source` text NOT NULL,
	`assisted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rl_card` ON `review_log` (`card_id`,`review_time`);--> statement-breakpoint
CREATE INDEX `rl_course` ON `review_log` (`course_id`,`review_time`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`type` text NOT NULL,
	`lesson_id` text,
	`unit_id` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`summary_json` text,
	`state_json` text
);
--> statement-breakpoint
CREATE INDEX `sessions_course` ON `sessions` (`course_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`curriculum_id` text,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`hash` text NOT NULL,
	`licence` text,
	`page_count` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `turns` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`phase` text,
	`concept_id` text,
	`hint_level` integer,
	`observer_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `turns_session` ON `turns` (`session_id`,`ordinal`);