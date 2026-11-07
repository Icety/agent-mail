import type { Database } from 'bun:sqlite'
import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import type { InboundView } from '../../../shared/types'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { fileURLToPath } from 'node:url'
import type { InboundRepo, MailRepo, MailStore } from '../../ports'
import * as schema from './schema'
import { addresses, audit, drafts, inbound, mailState, replies, senders } from './schema'

export type SqliteMailDb = BunSQLiteDatabase<typeof schema>

export const sqliteMigrationsDir = fileURLToPath(new URL('./migrations', import.meta.url))

// Runs on the host's own SQLite connection with its own migrations table, so the host's and
// mail's migrations never collide. Sharing the connection keeps one writer per file.
export const openSqliteMailDb = (sqlite: Database, migrationsDir: string = sqliteMigrationsDir): SqliteMailDb => {
  sqlite.exec('PRAGMA journal_mode = WAL;')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  sqlite.exec('PRAGMA busy_timeout = 5000;')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: migrationsDir, migrationsTable: '__drizzle_migrations_mail' })
  return db
}

const createMailRepo = (db: SqliteMailDb): MailRepo => ({
  getDraft: async id => db.select().from(drafts).where(eq(drafts.id, id)).get(),
  listDrafts: async (filter = {}) => db.select().from(drafts).where(and(
    filter.conversation ? eq(drafts.conversationId, filter.conversation) : undefined,
    filter.agent ? eq(drafts.agentId, filter.agent) : undefined,
  )).orderBy(desc(drafts.createdAt), asc(drafts.id)).all(),
  insertDraft: async row => db.insert(drafts).values(row).returning().get(),
  update: async (previous, values) => db.update(drafts).set(values)
    .where(and(eq(drafts.id, previous.id), eq(drafts.revision, previous.revision), eq(drafts.state, previous.state)))
    .returning().get(),
  due: async now => db.select().from(drafts).where(and(eq(drafts.state, 'queued'), lte(drafts.sendAt, now))).all(),
  claim: async (id, now) => db.transaction(tx => tx.update(drafts).set({ state: 'sending', updatedAt: now })
    .where(and(eq(drafts.id, id), eq(drafts.state, 'queued'), lte(drafts.sendAt, now), sql`${drafts.queuedRevision} = ${drafts.revision}`, sql`${drafts.queuedSnapshot} IS NOT NULL`))
    .returning().get(), { behavior: 'immediate' }),
  recover: async now => db.update(drafts).set({ state: 'unknown', error: 'Delivery unknown, check before resending', updatedAt: now })
    .where(eq(drafts.state, 'sending')).returning().all(),
  findByMessageIds: async ids => ids.length
    ? db.select().from(drafts).where(and(inArray(drafts.messageId, ids), eq(drafts.outcome, 'sent'))).get()
    : undefined,

  listReplies: async (filter = {}) => db.select({ reply: replies }).from(replies)
    .innerJoin(drafts, eq(replies.draftId, drafts.id)).where(and(
      filter.conversation ? eq(drafts.conversationId, filter.conversation) : undefined,
      filter.agent ? eq(drafts.agentId, filter.agent) : undefined,
      filter.unread ? isNull(replies.readAt) : undefined,
    )).orderBy(asc(replies.receivedAt), asc(replies.id)).all().map(row => row.reply),
  insertReply: async row => db.insert(replies).values(row).onConflictDoNothing({ target: replies.messageId }).returning().get(),
  getReply: async id => db.select().from(replies).where(eq(replies.id, id)).get(),
  setReplyNote: async (id, note) => db.update(replies).set({ agentNote: note }).where(eq(replies.id, id)).returning().get(),
  markRead: async (id, now) => db.update(replies).set({ readAt: now }).where(eq(replies.id, id)).returning().get(),

  listSenders: async agent => db.select().from(senders)
    .where(agent ? eq(senders.agentId, agent) : undefined)
    .orderBy(desc(senders.isDefault), asc(senders.createdAt), asc(sql`${senders}.rowid`)).all(),
  saveSender: async row => db.transaction(tx => {
    const existing = tx.select().from(senders).where(and(eq(senders.agentId, row.agentId), eq(senders.address, row.address))).get()
    const saved = { ...row, id: existing?.id ?? row.id, createdAt: existing?.createdAt ?? row.createdAt }
    if (row.isDefault) tx.update(senders).set({ isDefault: false }).where(eq(senders.agentId, row.agentId)).run()
    return tx.insert(senders).values(saved)
      .onConflictDoUpdate({ target: [senders.agentId, senders.address], set: { name: row.name, isDefault: row.isDefault } })
      .returning().get()
  }),
  deleteSender: async id => {
    db.transaction(tx => {
      const removed = tx.delete(senders).where(eq(senders.id, id)).returning().get()
      if (!removed?.isDefault) return
      const next = tx.select().from(senders).where(eq(senders.agentId, removed.agentId))
        .orderBy(asc(senders.createdAt), asc(sql`${senders}.rowid`)).get()
      if (next) tx.update(senders).set({ isDefault: true }).where(eq(senders.id, next.id)).run()
    }, { behavior: 'immediate' })
  },

  getState: async key => db.select().from(mailState).where(eq(mailState.key, key)).get()?.value,
  setState: async (key, value, now) => {
    db.insert(mailState).values({ key, value, updatedAt: now })
      .onConflictDoUpdate({ target: mailState.key, set: { value, updatedAt: now } }).run()
  },
})

const createInboundRepo = (db: SqliteMailDb): InboundRepo => ({
  listAddresses: async () => db.select().from(addresses).orderBy(asc(addresses.address)).all(),
  getAddress: async id => db.select().from(addresses).where(eq(addresses.id, id)).get(),
  addressByEmail: async address => db.select().from(addresses).where(eq(addresses.address, address.toLowerCase())).get(),
  upsertAddress: async row => db.insert(addresses).values(row)
    .onConflictDoUpdate({ target: addresses.id, set: { address: row.address, displayName: row.displayName, updatedAt: row.updatedAt } })
    .returning().get(),
  patchAddress: async (id, values, now) => db.update(addresses).set({ ...values, updatedAt: now }).where(eq(addresses.id, id)).returning().get(),

  insertInbound: async row => db.insert(inbound).values(row).onConflictDoNothing({ target: inbound.openmailMessageId }).returning().get(),
  knownMessageIds: async ids => new Set(ids.length
    ? db.select({ id: inbound.openmailMessageId }).from(inbound).where(inArray(inbound.openmailMessageId, ids)).all().map(r => r.id)
    : []),
  getInbound: async id => db.select().from(inbound).where(eq(inbound.id, id)).get(),
  updateInbound: async (id, values) => db.update(inbound).set(values).where(eq(inbound.id, id)).returning().get(),
  unhandled: async () => db.select().from(inbound).where(eq(inbound.status, 'received')).orderBy(asc(inbound.receivedAt)).all(),
  listInbound: async ({ view, from }) => {
    const pattern = from ? `%${from.replace(/[\\%_]/g, '\\$&')}%` : undefined
    const views: Record<InboundView, SQL | undefined> = {
      inbox: and(ne(inbound.status, 'done'), or(isNull(inbound.category), ne(inbound.category, 'noise'))),
      noise: and(ne(inbound.status, 'done'), eq(inbound.category, 'noise')),
      done: eq(inbound.status, 'done'),
      all: undefined,
    }
    // SQLite LIKE ignores ASCII case.
    return db.select().from(inbound).where(and(
      views[view],
      pattern ? or(sql`${inbound.fromAddress} LIKE ${pattern} ESCAPE '\\'`, sql`${inbound.fromName} LIKE ${pattern} ESCAPE '\\'`) : undefined,
    )).orderBy(desc(inbound.receivedAt)).limit(200).all()
  },
  undigestedNoise: async () => db.select().from(inbound)
    .where(and(eq(inbound.category, 'noise'), eq(inbound.status, 'handled'), isNull(inbound.digestedAt))).orderBy(asc(inbound.receivedAt)).all(),
  draftsFor: async inboundId => db.select({ id: drafts.id, state: drafts.state }).from(drafts)
    .where(eq(drafts.inboundId, inboundId)).orderBy(asc(drafts.createdAt)).all(),

  audit: async (kind, ref, detail, at) => {
    db.insert(audit).values({ kind, ref, detail, at }).run()
  },
})

export const createSqliteMailStore = (sqlite: Database, migrationsDir?: string): MailStore => {
  const db = openSqliteMailDb(sqlite, migrationsDir)
  return { mail: createMailRepo(db), inbound: createInboundRepo(db) }
}
