import { and, asc, desc, eq, getTableColumns, inArray, isNull, lte, ne, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { fileURLToPath } from 'node:url'
import type { InboundRepo, MailRepo, MailStore } from '../../ports'
import type { SenderRow } from '../../rows'
import { addresses, audit, drafts, inbound, mailState, replies, senders } from './schema'

// Any Drizzle Postgres database: postgres-js, node-postgres, PGlite. Only the query builder is used.
export type PgMailDb = PgDatabase<PgQueryResultHKT>

export const pgMigrationsDir = fileURLToPath(new URL('./migrations', import.meta.url))

const { seq: _seq, ...senderColumns } = getTableColumns(senders)
const first = <T>(rows: T[]): T | undefined => rows[0]

const createMailRepo = (db: PgMailDb): MailRepo => ({
  getDraft: async id => first(await db.select().from(drafts).where(eq(drafts.id, id))),
  listDrafts: async (filter = {}) => db.select().from(drafts).where(and(
    filter.conversation ? eq(drafts.conversationId, filter.conversation) : undefined,
    filter.agent ? eq(drafts.agentId, filter.agent) : undefined,
  )).orderBy(desc(drafts.createdAt), asc(drafts.id)),
  insertDraft: async row => {
    const inserted = first(await db.insert(drafts).values(row).returning())
    if (!inserted) throw new Error(`Inserting mail draft ${row.id} returned nothing`)
    return inserted
  },
  update: async (previous, values) => first(await db.update(drafts).set(values)
    .where(and(eq(drafts.id, previous.id), eq(drafts.revision, previous.revision), eq(drafts.state, previous.state)))
    .returning()),
  due: async now => db.select().from(drafts).where(and(eq(drafts.state, 'queued'), lte(drafts.sendAt, now))),
  // One UPDATE: Postgres row locks make a second claimer see the new state and match nothing.
  claim: async (id, now) => first(await db.update(drafts).set({ state: 'sending', updatedAt: now })
    .where(and(eq(drafts.id, id), eq(drafts.state, 'queued'), lte(drafts.sendAt, now), sql`${drafts.queuedRevision} = ${drafts.revision}`, sql`${drafts.queuedSnapshot} IS NOT NULL`))
    .returning()),
  recover: async now => db.update(drafts).set({ state: 'unknown', error: 'Delivery unknown, check before resending', updatedAt: now })
    .where(eq(drafts.state, 'sending')).returning(),
  findByMessageIds: async ids => ids.length
    ? first(await db.select().from(drafts).where(and(inArray(drafts.messageId, ids), eq(drafts.outcome, 'sent'))).limit(1))
    : undefined,

  listReplies: async (filter = {}) => (await db.select({ reply: replies }).from(replies)
    .innerJoin(drafts, eq(replies.draftId, drafts.id)).where(and(
      filter.conversation ? eq(drafts.conversationId, filter.conversation) : undefined,
      filter.agent ? eq(drafts.agentId, filter.agent) : undefined,
      filter.unread ? isNull(replies.readAt) : undefined,
    )).orderBy(asc(replies.receivedAt), asc(replies.id))).map(row => row.reply),
  insertReply: async row => first(await db.insert(replies).values(row).onConflictDoNothing({ target: replies.messageId }).returning()),
  getReply: async id => first(await db.select().from(replies).where(eq(replies.id, id))),
  setReplyNote: async (id, note) => first(await db.update(replies).set({ agentNote: note }).where(eq(replies.id, id)).returning()),
  markRead: async (id, now) => first(await db.update(replies).set({ readAt: now }).where(eq(replies.id, id)).returning()),

  listSenders: async agent => db.select(senderColumns).from(senders)
    .where(agent ? eq(senders.agentId, agent) : undefined)
    .orderBy(desc(senders.isDefault), asc(senders.createdAt), asc(senders.seq)),
  saveSender: async row => db.transaction(async (tx): Promise<SenderRow> => {
    const existing = first(await tx.select(senderColumns).from(senders).where(and(eq(senders.agentId, row.agentId), eq(senders.address, row.address))))
    const saved = { ...row, id: existing?.id ?? row.id, createdAt: existing?.createdAt ?? row.createdAt }
    if (row.isDefault) await tx.update(senders).set({ isDefault: false }).where(eq(senders.agentId, row.agentId))
    const stored = first(await tx.insert(senders).values(saved)
      .onConflictDoUpdate({ target: [senders.agentId, senders.address], set: { name: row.name, isDefault: row.isDefault } })
      .returning(senderColumns))
    if (!stored) throw new Error(`Saving mail sender ${row.address} returned nothing`)
    return stored
  }),
  deleteSender: async id => {
    await db.transaction(async tx => {
      const removed = first(await tx.delete(senders).where(eq(senders.id, id)).returning())
      if (!removed?.isDefault) return
      const next = first(await tx.select({ id: senders.id }).from(senders).where(eq(senders.agentId, removed.agentId))
        .orderBy(asc(senders.createdAt), asc(senders.seq)).limit(1))
      if (next) await tx.update(senders).set({ isDefault: true }).where(eq(senders.id, next.id))
    })
  },

  getState: async key => first(await db.select().from(mailState).where(eq(mailState.key, key)))?.value,
  setState: async (key, value, now) => {
    await db.insert(mailState).values({ key, value, updatedAt: now })
      .onConflictDoUpdate({ target: mailState.key, set: { value, updatedAt: now } })
  },
})

const createInboundRepo = (db: PgMailDb): InboundRepo => ({
  listAddresses: async () => db.select().from(addresses).orderBy(asc(addresses.address)),
  getAddress: async id => first(await db.select().from(addresses).where(eq(addresses.id, id))),
  addressByEmail: async address => first(await db.select().from(addresses).where(eq(addresses.address, address.toLowerCase()))),
  upsertAddress: async row => {
    const stored = first(await db.insert(addresses).values(row)
      .onConflictDoUpdate({ target: addresses.id, set: { address: row.address, displayName: row.displayName, updatedAt: row.updatedAt } })
      .returning())
    if (!stored) throw new Error(`Saving mail address ${row.address} returned nothing`)
    return stored
  },
  patchAddress: async (id, values, now) => first(await db.update(addresses).set({ ...values, updatedAt: now }).where(eq(addresses.id, id)).returning()),

  insertInbound: async row => first(await db.insert(inbound).values(row).onConflictDoNothing({ target: inbound.openmailMessageId }).returning()),
  knownMessageIds: async ids => new Set(ids.length
    ? (await db.select({ id: inbound.openmailMessageId }).from(inbound).where(inArray(inbound.openmailMessageId, ids))).map(r => r.id)
    : []),
  getInbound: async id => first(await db.select().from(inbound).where(eq(inbound.id, id))),
  updateInbound: async (id, values) => first(await db.update(inbound).set(values).where(eq(inbound.id, id)).returning()),
  unhandled: async () => db.select().from(inbound).where(eq(inbound.status, 'received')).orderBy(asc(inbound.receivedAt)),
  listInbound: async ({ done }) => db.select().from(inbound)
    .where(done ? undefined : ne(inbound.status, 'done')).orderBy(desc(inbound.receivedAt)).limit(200),
  undigestedNoise: async () => db.select().from(inbound)
    .where(and(eq(inbound.category, 'noise'), eq(inbound.status, 'handled'), isNull(inbound.digestedAt))).orderBy(asc(inbound.receivedAt)),
  draftsFor: async inboundId => db.select({ id: drafts.id, state: drafts.state }).from(drafts)
    .where(eq(drafts.inboundId, inboundId)).orderBy(asc(drafts.createdAt)),

  audit: async (kind, ref, detail, at) => {
    await db.insert(audit).values({ kind, ref, detail, at })
  },
})

// Tables must exist: migrate with ./migrations (migrationsTable __drizzle_migrations_mail) or
// include ./schema in the host's own Drizzle schema.
export const createPgMailStore = (db: PgMailDb): MailStore => ({ mail: createMailRepo(db), inbound: createInboundRepo(db) })
