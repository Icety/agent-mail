import { Database } from 'bun:sqlite'
import { createSqliteMailStore } from '../../../lib/storage/sqlite/store'

// A host with one agent and one conversation, an in-memory database and no auth. Local only.
const agents = [{ id: 'agent-1', name: 'Agent one' }]

export default defineNitroPlugin(nitroApp => defineMailHost(nitroApp, {
  store: () => createSqliteMailStore(new Database(':memory:'), mailMigrationsDir('sqlite')),
  requireOwner: async () => {},
  requireAgent: async () => {},
  owner: { name: 'Sam', fullName: 'Sam Jansen' },
  assistantName: 'Playground',
  timeZone: 'Europe/Amsterdam',
  links: { conversation: id => `/mail?conversation=${id}`, fallback: '/mail', inbound: id => `/mail/in/${id}`, inbox: '/mail/inbox' },
  conversation: async id => id === 'conv-1' ? { agentId: 'agent-1' } : undefined,
  agentExists: async id => agents.some(a => a.id === id),
  agents: async () => agents,
  sendSystemNote: async (conversationId, text) => { console.info('[playground] note', conversationId, text.split('\n')[0]) },
  notify: async (_agentId, text) => {
    console.info('[playground] notify', text.split('\n')[0])
    return { conversationId: 'conv-1' }
  },
}))
