import type { AddressRow, DraftRow, InboundRow, ReplyRow, SenderRow } from './rows'
import type { MailAgentScope, MailAuthorization, MailState, MailTopicMap, MailTransport } from '../shared/types'

export interface MailFilter { conversation?: string, agent?: string }
export type ReplyFilter = MailFilter & { unread?: string }

// Storage port. Every adapter (lib/storage/sqlite, lib/storage/pg) implements both repos.
export interface MailRepo {
  getDraft: (id: string) => Promise<DraftRow | undefined>
  listDrafts: (filter?: MailFilter) => Promise<DraftRow[]>
  insertDraft: (row: DraftRow) => Promise<DraftRow>
  // Compare-and-set on (id, revision, state) of `previous`: undefined when the row changed since.
  update: (previous: DraftRow, values: Partial<DraftRow>) => Promise<DraftRow | undefined>
  due: (now: Date) => Promise<DraftRow[]>
  // One atomic statement: queued, due, queued_revision = revision and a snapshot, or nothing.
  claim: (id: string, now: Date) => Promise<DraftRow | undefined>
  // Rows left in `sending` become `unknown`.
  recover: (now: Date) => Promise<DraftRow[]>
  findByMessageIds: (ids: string[]) => Promise<DraftRow | undefined>

  listReplies: (filter?: ReplyFilter) => Promise<ReplyRow[]>
  // Undefined when a reply with this Message-ID is already stored.
  insertReply: (row: ReplyRow) => Promise<ReplyRow | undefined>
  getReply: (id: string) => Promise<ReplyRow | undefined>
  setReplyNote: (id: string, note: string) => Promise<ReplyRow | undefined>
  markRead: (id: string, now: Date) => Promise<ReplyRow | undefined>

  listSenders: (agent?: string) => Promise<SenderRow[]>
  // Upsert on (agentId, address). A new default clears the agent's other defaults.
  saveSender: (row: SenderRow) => Promise<SenderRow>
  // Deleting the default promotes the agent's oldest remaining sender.
  deleteSender: (id: string) => Promise<void>

  getState: (key: string) => Promise<string | undefined>
  setState: (key: string, value: string, now: Date) => Promise<void>
}

export interface InboundRepo {
  listAddresses: () => Promise<AddressRow[]>
  getAddress: (id: string) => Promise<AddressRow | undefined>
  addressByEmail: (address: string) => Promise<AddressRow | undefined>
  // Insert, or update address and display name only: the owner's kind and agent choices stay.
  upsertAddress: (row: AddressRow) => Promise<AddressRow>
  patchAddress: (id: string, values: Partial<Pick<AddressRow, 'kind' | 'agentId'>>, now: Date) => Promise<AddressRow | undefined>

  // Undefined when the message was already stored (WebSocket and poll both saw it).
  insertInbound: (row: InboundRow) => Promise<InboundRow | undefined>
  knownMessageIds: (ids: string[]) => Promise<Set<string>>
  getInbound: (id: string) => Promise<InboundRow | undefined>
  updateInbound: (id: string, values: Partial<InboundRow>) => Promise<InboundRow | undefined>
  unhandled: () => Promise<InboundRow[]>
  listInbound: (opts: { done: boolean }) => Promise<InboundRow[]>
  undigestedNoise: () => Promise<InboundRow[]>
  draftsFor: (inboundId: string) => Promise<{ id: string, state: MailState }[]>

  audit: (kind: string, ref: string | null, detail: Record<string, unknown>, at: Date) => Promise<void>
}

export interface MailStore {
  mail: MailRepo
  inbound: InboundRepo
}

// Who the mail belongs to. Used in notes to agents, model prompts and UI copy.
export interface MailOwner {
  // Short name: "Thomas asked to revise ...".
  name: string
  // Used where the model needs to know who it writes for: "Sam Jansen".
  fullName: string
}

// Where links in notes, pushes and summaries point. Paths in the host app.
export interface MailLinks {
  conversation: (conversationId: string) => string
  // When a draft has no conversation.
  fallback: string
  inbound: (inboundId: string) => string
  inbox: string
}

// What the host app (Koopa, Toadette, Moonies, ...) gives the mail services.
export interface MailHostPorts {
  owner: MailOwner
  // The host's assistant, named in notices: "Koopa could not summarize this mail".
  assistantName: string
  // IANA zone for the daily digest hour, e.g. Europe/Amsterdam.
  timeZone: string
  links: MailLinks
  conversation: (id: string) => Promise<{ agentId: string } | undefined>
  agentExists: (id: string) => Promise<boolean>
  agents: () => Promise<{ id: string, name: string }[]>
  // A system note (to the agent, in its conversation): revision requests, replies.
  sendSystemNote: (conversationId: string, text: string) => Promise<unknown>
  // True when this exact system note is already in the conversation. Makes reply notes
  // exactly-once across a crash between posting the note and recording it.
  noteExists?: (conversationId: string, text: string) => Promise<boolean>
  // A visible message to the owner in the agent's main chat (null: the always-on assistant).
  notify: (agentId: string | null, text: string) => Promise<{ conversationId: string }>
  push?: (payload: { title: string, body: string, url: string }) => Promise<void>
  publish?: <K extends keyof MailTopicMap>(topic: K, data: MailTopicMap[K]) => void
  // Other parts of the host may set ctx.allowed = false (e.g. mail off for a project).
  authorize?: (ctx: MailAuthorization) => void | Promise<void>
  // Other parts of the host add project agents to ctx.projectAgentIds (summary badges).
  agentScope?: (ctx: MailAgentScope) => void | Promise<void>
}

export type { MailTransport }
