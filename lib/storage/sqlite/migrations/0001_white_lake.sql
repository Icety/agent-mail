CREATE TABLE `mail_addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`display_name` text,
	`kind` text NOT NULL,
	`agent_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_addresses_address_unique` ON `mail_addresses` (`address`);--> statement-breakpoint
CREATE TABLE `mail_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`ref` text,
	`detail` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mail_audit_ref_idx` ON `mail_audit` (`ref`);--> statement-breakpoint
CREATE TABLE `mail_inbound` (
	`id` text PRIMARY KEY NOT NULL,
	`openmail_message_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`address_id` text NOT NULL,
	`to_address` text NOT NULL,
	`from_address` text NOT NULL,
	`from_name` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`received_at` integer NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`category` text,
	`summary` text,
	`suggested_action` text,
	`trusted` integer DEFAULT false NOT NULL,
	`conversation_id` text,
	`digested_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_inbound_openmail_message_id_unique` ON `mail_inbound` (`openmail_message_id`);--> statement-breakpoint
CREATE INDEX `mail_inbound_status_idx` ON `mail_inbound` (`status`,`received_at`);--> statement-breakpoint
CREATE INDEX `mail_inbound_thread_idx` ON `mail_inbound` (`thread_id`);--> statement-breakpoint
ALTER TABLE `mail_drafts` ADD `inbound_id` text;