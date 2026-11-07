CREATE TABLE `mail_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`conversation_id` text,
	`from_address` text NOT NULL,
	`to` text NOT NULL,
	`cc` text DEFAULT '[]' NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`context_label` text,
	`context_href` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`queued_revision` integer,
	`queued_snapshot` text,
	`send_at` integer,
	`sent_at` integer,
	`outcome` text,
	`error` text,
	`message_id` text,
	`revision_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mail_drafts_conversation_idx` ON `mail_drafts` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `mail_drafts_agent_idx` ON `mail_drafts` (`agent_id`);--> statement-breakpoint
CREATE INDEX `mail_drafts_due_idx` ON `mail_drafts` (`state`,`send_at`);--> statement-breakpoint
CREATE INDEX `mail_drafts_message_idx` ON `mail_drafts` (`message_id`);--> statement-breakpoint
CREATE TABLE `mail_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mail_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`message_id` text NOT NULL,
	`in_reply_to` text,
	`from_name` text NOT NULL,
	`from_address` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`received_at` integer NOT NULL,
	`agent_note` text,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `mail_drafts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_replies_message_id_unique` ON `mail_replies` (`message_id`);--> statement-breakpoint
CREATE INDEX `mail_replies_draft_idx` ON `mail_replies` (`draft_id`);--> statement-breakpoint
CREATE TABLE `mail_senders` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`address` text NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_senders_agent_address_idx` ON `mail_senders` (`agent_id`,`address`);