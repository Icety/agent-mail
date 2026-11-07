import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import type { AddressRow, DraftRow, InboundRow, ReplyRow, SenderRow } from '../../rows'
import { ADDRESS_KINDS, INBOUND_CATEGORIES, MAIL_STATES, type InboundAttachment, type QueuedSnapshot } from '../../../shared/types'

// The same mail_ tables for Postgres. A host either re-exports these from its own Drizzle schema
// (and lets drizzle-kit generate its migrations) or runs ./migrations with migrationsTable
// __drizzle_migrations_mail. Row shapes: lib/rows.ts.

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const senders = pgTable('mail_senders', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  address: text('address').notNull(),
  name: text('name').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: at('created_at').notNull(),
  // Insertion order, the tie-break for "oldest sender" (SQLite uses rowid). Never on the wire.
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
}, table => [
  uniqueIndex('mail_senders_agent_address_idx').on(table.agentId, table.address),
])

export const drafts = pgTable('mail_drafts', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  conversationId: text('conversation_id'),
  fromAddress: text('from_address').notNull(),
  to: jsonb('to').$type<string[]>().notNull(),
  cc: jsonb('cc').$type<string[]>().notNull().default([]),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  contextLabel: text('context_label'),
  contextHref: text('context_href'),
  state: text('state', { enum: MAIL_STATES }).notNull().default('draft'),
  revision: integer('revision').notNull().default(1),
  queuedRevision: integer('queued_revision'),
  queuedSnapshot: jsonb('queued_snapshot').$type<QueuedSnapshot>(),
  sendAt: at('send_at'),
  sentAt: at('sent_at'),
  outcome: text('outcome', { enum: ['sent', 'simulated'] }),
  error: text('error'),
  messageId: text('message_id'),
  revisionNote: text('revision_note'),
  inboundId: text('inbound_id'),
  createdAt: at('created_at').notNull(),
  updatedAt: at('updated_at').notNull(),
}, table => [
  index('mail_drafts_conversation_idx').on(table.conversationId),
  index('mail_drafts_agent_idx').on(table.agentId),
  index('mail_drafts_due_idx').on(table.state, table.sendAt),
  index('mail_drafts_message_idx').on(table.messageId),
])

export const replies = pgTable('mail_replies', {
  id: text('id').primaryKey(),
  draftId: text('draft_id').notNull().references(() => drafts.id),
  messageId: text('message_id').notNull().unique(),
  inReplyTo: text('in_reply_to'),
  fromName: text('from_name').notNull(),
  fromAddress: text('from_address').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  receivedAt: at('received_at').notNull(),
  agentNote: text('agent_note'),
  readAt: at('read_at'),
  createdAt: at('created_at').notNull(),
}, table => [
  index('mail_replies_draft_idx').on(table.draftId),
])

export const mailState = pgTable('mail_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: at('updated_at').notNull(),
})

export const addresses = pgTable('mail_addresses', {
  id: text('id').primaryKey(),
  address: text('address').notNull().unique(),
  displayName: text('display_name'),
  kind: text('kind', { enum: ADDRESS_KINDS }).notNull(),
  agentId: text('agent_id'),
  createdAt: at('created_at').notNull(),
  updatedAt: at('updated_at').notNull(),
})

export const inbound = pgTable('mail_inbound', {
  id: text('id').primaryKey(),
  openmailMessageId: text('openmail_message_id').notNull().unique(),
  threadId: text('thread_id').notNull(),
  addressId: text('address_id').notNull(),
  toAddress: text('to_address').notNull(),
  fromAddress: text('from_address').notNull(),
  fromName: text('from_name').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  attachments: jsonb('attachments').$type<InboundAttachment[]>().notNull().default([]),
  receivedAt: at('received_at').notNull(),
  status: text('status', { enum: ['received', 'handled', 'done'] }).notNull().default('received'),
  category: text('category', { enum: INBOUND_CATEGORIES }),
  summary: text('summary'),
  suggestedAction: text('suggested_action'),
  trusted: boolean('trusted').notNull().default(false),
  conversationId: text('conversation_id'),
  digestedAt: at('digested_at'),
  createdAt: at('created_at').notNull(),
  updatedAt: at('updated_at').notNull(),
}, table => [
  index('mail_inbound_status_idx').on(table.status, table.receivedAt),
  index('mail_inbound_thread_idx').on(table.threadId),
])

export const audit = pgTable('mail_audit', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  at: at('at').notNull(),
  kind: text('kind').notNull(),
  ref: text('ref'),
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
}, table => [
  index('mail_audit_ref_idx').on(table.ref),
])

// Compile-time check: these tables store exactly the rows the services use.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const same = <T extends true>(): T => true as T
same<Same<Omit<typeof senders.$inferSelect, 'seq'>, SenderRow>>()
same<Same<typeof drafts.$inferSelect, DraftRow>>()
same<Same<typeof replies.$inferSelect, ReplyRow>>()
same<Same<typeof addresses.$inferSelect, AddressRow>>()
same<Same<typeof inbound.$inferSelect, InboundRow>>()
