import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { AddressRow, DraftRow, InboundRow, ReplyRow, SenderRow } from '../../rows'
import { ADDRESS_KINDS, INBOUND_CATEGORIES, MAIL_STATES, type InboundAttachment, type QueuedSnapshot } from '../../../shared/types'

// Mail tables in the host's SQLite database, prefixed mail_ and migrated separately
// (./migrations, table __drizzle_migrations_mail). Row shapes: lib/rows.ts.

export const senders = sqliteTable('mail_senders', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  address: text('address').notNull(),
  name: text('name').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, table => [
  uniqueIndex('mail_senders_agent_address_idx').on(table.agentId, table.address),
])

export const drafts = sqliteTable('mail_drafts', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  conversationId: text('conversation_id'),
  fromAddress: text('from_address').notNull(),
  to: text('to', { mode: 'json' }).$type<string[]>().notNull(),
  cc: text('cc', { mode: 'json' }).$type<string[]>().notNull().default([]),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  contextLabel: text('context_label'),
  contextHref: text('context_href'),
  state: text('state', { enum: MAIL_STATES }).notNull().default('draft'),
  revision: integer('revision').notNull().default(1),
  // Set by Send; the scheduler claims only rows where queued_revision = revision.
  queuedRevision: integer('queued_revision'),
  queuedSnapshot: text('queued_snapshot', { mode: 'json' }).$type<QueuedSnapshot>(),
  sendAt: integer('send_at', { mode: 'timestamp_ms' }),
  sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
  outcome: text('outcome', { enum: ['sent', 'simulated'] }),
  error: text('error'),
  messageId: text('message_id'),
  revisionNote: text('revision_note'),
  // Set when the draft answers an inbound mail: sent in its OpenMail thread, revised server side.
  inboundId: text('inbound_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, table => [
  index('mail_drafts_conversation_idx').on(table.conversationId),
  index('mail_drafts_agent_idx').on(table.agentId),
  index('mail_drafts_due_idx').on(table.state, table.sendAt),
  index('mail_drafts_message_idx').on(table.messageId),
])

export const replies = sqliteTable('mail_replies', {
  id: text('id').primaryKey(),
  draftId: text('draft_id').notNull().references(() => drafts.id),
  // Message-ID of the reply itself: IMAP polling dedupes on it.
  messageId: text('message_id').notNull().unique(),
  inReplyTo: text('in_reply_to'),
  fromName: text('from_name').notNull(),
  fromAddress: text('from_address').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
  agentNote: text('agent_note'),
  readAt: integer('read_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, table => [
  index('mail_replies_draft_idx').on(table.draftId),
])

// Small key/value state, e.g. 'imap:INBOX:lastUid' -> '4211'.
export const mailState = sqliteTable('mail_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// OpenMail inboxes the app listens to, synced from OpenMail. id is the OpenMail inbox id.
// agentId: whose main chat gets the notices and drafts (null: the always-on assistant).
export const addresses = sqliteTable('mail_addresses', {
  id: text('id').primaryKey(),
  address: text('address').notNull().unique(),
  displayName: text('display_name'),
  kind: text('kind', { enum: ADDRESS_KINDS }).notNull(),
  agentId: text('agent_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// Every inbound OpenMail message, sanitized. status: received (stored, not handled yet),
// handled (classified, owner notified unless noise), done (the owner finished it, their reply was
// sent, or an agent closed it). Noise stays handled, out of the inbox, until the digest or done.
export const inbound = sqliteTable('mail_inbound', {
  id: text('id').primaryKey(),
  openmailMessageId: text('openmail_message_id').notNull().unique(),
  threadId: text('thread_id').notNull(),
  addressId: text('address_id').notNull(),
  toAddress: text('to_address').notNull(),
  fromAddress: text('from_address').notNull(),
  fromName: text('from_name').notNull(),
  replyTo: text('reply_to'),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  attachments: text('attachments', { mode: 'json' }).$type<InboundAttachment[]>().notNull().default([]),
  receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
  status: text('status', { enum: ['received', 'handled', 'done'] }).notNull().default('received'),
  category: text('category', { enum: INBOUND_CATEGORIES }),
  summary: text('summary'),
  suggestedAction: text('suggested_action'),
  // Intake only: the mail came from the owner's own address with DMARC pass.
  trusted: integer('trusted', { mode: 'boolean' }).notNull().default(false),
  conversationId: text('conversation_id'),
  digestedAt: integer('digested_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, table => [
  index('mail_inbound_status_idx').on(table.status, table.receivedAt),
  index('mail_inbound_thread_idx').on(table.threadId),
])

// Append-only log of inbound events, classifications, drafts and sends.
export const audit = sqliteTable('mail_audit', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  at: integer('at', { mode: 'timestamp_ms' }).notNull(),
  kind: text('kind').notNull(),
  ref: text('ref'),
  detail: text('detail', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
}, table => [
  index('mail_audit_ref_idx').on(table.ref),
])

// Compile-time check: these tables store exactly the rows the services use.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const same = <T extends true>(): T => true as T
same<Same<typeof senders.$inferSelect, SenderRow>>()
same<Same<typeof drafts.$inferSelect, DraftRow>>()
same<Same<typeof replies.$inferSelect, ReplyRow>>()
same<Same<typeof addresses.$inferSelect, AddressRow>>()
same<Same<typeof inbound.$inferSelect, InboundRow>>()
