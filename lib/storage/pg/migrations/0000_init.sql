CREATE TABLE "mail_addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"display_name" text,
	"kind" text NOT NULL,
	"agent_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mail_addresses_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "mail_audit" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mail_audit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"ref" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"conversation_id" text,
	"from_address" text NOT NULL,
	"to" jsonb NOT NULL,
	"cc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"context_label" text,
	"context_href" text,
	"state" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"queued_revision" integer,
	"queued_snapshot" jsonb,
	"send_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"outcome" text,
	"error" text,
	"message_id" text,
	"revision_note" text,
	"inbound_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_inbound" (
	"id" text PRIMARY KEY NOT NULL,
	"openmail_message_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"address_id" text NOT NULL,
	"to_address" text NOT NULL,
	"from_address" text NOT NULL,
	"from_name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"category" text,
	"summary" text,
	"suggested_action" text,
	"trusted" boolean DEFAULT false NOT NULL,
	"conversation_id" text,
	"digested_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mail_inbound_openmail_message_id_unique" UNIQUE("openmail_message_id")
);
--> statement-breakpoint
CREATE TABLE "mail_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_replies" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"message_id" text NOT NULL,
	"in_reply_to" text,
	"from_name" text NOT NULL,
	"from_address" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"agent_note" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mail_replies_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "mail_senders" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"address" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "mail_senders_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1)
);
--> statement-breakpoint
ALTER TABLE "mail_replies" ADD CONSTRAINT "mail_replies_draft_id_mail_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."mail_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_audit_ref_idx" ON "mail_audit" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "mail_drafts_conversation_idx" ON "mail_drafts" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "mail_drafts_agent_idx" ON "mail_drafts" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "mail_drafts_due_idx" ON "mail_drafts" USING btree ("state","send_at");--> statement-breakpoint
CREATE INDEX "mail_drafts_message_idx" ON "mail_drafts" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "mail_inbound_status_idx" ON "mail_inbound" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "mail_inbound_thread_idx" ON "mail_inbound" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "mail_replies_draft_idx" ON "mail_replies" USING btree ("draft_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_senders_agent_address_idx" ON "mail_senders" USING btree ("agent_id","address");