import { Database } from 'bun:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle as pgDrizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { drizzle as sqliteDrizzle } from 'drizzle-orm/bun-sqlite'
import type { MailHostPorts, MailStore } from './ports'
import { createSqliteMailStore } from './storage/sqlite/store'
import { createPgMailStore, pgMigrationsDir } from './storage/pg/store'
import { audit as sqliteAudit } from './storage/sqlite/schema'
import { audit as pgAudit } from './storage/pg/schema'

export interface AuditLine { ref: string | null, detail: Record<string, unknown> }
export interface OpenedStore { store: MailStore, auditLines: (kind: string) => Promise<AuditLine[]> }

// Test support only (not exported). Every service test runs once per storage adapter, so both
// stores are held to the same contract.
export const storeAdapters: { name: string, open: () => Promise<OpenedStore> }[] = [
  { name: 'sqlite', open: async () => {
    const sqlite = new Database(':memory:')
    const store = createSqliteMailStore(sqlite)
    const db = sqliteDrizzle(sqlite)
    return { store, auditLines: async kind => db.select({ ref: sqliteAudit.ref, detail: sqliteAudit.detail }).from(sqliteAudit).where(eq(sqliteAudit.kind, kind)).orderBy(sqliteAudit.id).all() }
  } },
  { name: 'postgres', open: async () => {
    const db = pgDrizzle(new PGlite())
    await migrate(db, { migrationsFolder: pgMigrationsDir, migrationsTable: '__drizzle_migrations_mail' })
    return { store: createPgMailStore(db), auditLines: async kind => db.select({ ref: pgAudit.ref, detail: pgAudit.detail }).from(pgAudit).where(eq(pgAudit.kind, kind)).orderBy(pgAudit.id) }
  } },
]

export interface FakeMessage { conversationId: string, text: string, origin: 'system' | 'assistant' }

// A host with agents, conversations and a chat log in memory. notify posts to the agent's main
// conversation (`main:<agentId>`, `main:assistant` for null).
export const createFakeHost = (agents: { id: string, name: string }[], conversations: Record<string, string> = {}) => {
  const messages: FakeMessage[] = []
  const owned = new Map(Object.entries(conversations))
  const host: MailHostPorts = {
    owner: { name: 'Sam', fullName: 'Sam Jansen' },
    assistantName: 'Toad',
    timeZone: 'Europe/Amsterdam',
    links: { conversation: id => `/c/${id}`, fallback: '/mail', inbound: id => `/mail/in/${id}`, inbox: '/mail/inbox' },
    conversation: async id => {
      const agentId = owned.get(id)
      return agentId ? { agentId } : undefined
    },
    agentExists: async id => agents.some(agent => agent.id === id),
    agents: async () => agents,
    sendSystemNote: async (conversationId, text) => { messages.push({ conversationId, text, origin: 'system' }) },
    noteExists: async (conversationId, text) => messages.some(m => m.conversationId === conversationId && m.origin === 'system' && m.text === text),
    notify: async (agentId, text) => {
      const conversationId = `main:${agentId ?? 'assistant'}`
      owned.set(conversationId, agentId ?? agents[0]?.id ?? 'assistant')
      messages.push({ conversationId, text, origin: 'assistant' })
      return { conversationId }
    },
  }
  return {
    host, messages,
    notes: (conversationId?: string) => messages.filter(m => m.origin === 'system' && (!conversationId || m.conversationId === conversationId)),
    chatOf: (agentId: string | null) => messages.filter(m => m.conversationId === `main:${agentId ?? 'assistant'}`),
  }
}
