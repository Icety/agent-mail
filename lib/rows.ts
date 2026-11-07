import type { AddressKind, InboundAttachment, InboundCategory, MailState, QueuedSnapshot } from '../shared/types'

// Stored rows, the same shape for every storage adapter (SQLite and Postgres). Times are Dates.
// agentId and conversationId point at the host's own rows; there are no foreign keys to them.

export interface SenderRow {
  id: string
  agentId: string
  address: string
  name: string
  isDefault: boolean
  createdAt: Date
}

export interface DraftRow {
  id: string
  agentId: string
  conversationId: string | null
  fromAddress: string
  to: string[]
  cc: string[]
  subject: string
  body: string
  contextLabel: string | null
  contextHref: string | null
  state: MailState
  revision: number
  // Set by Send; the scheduler claims only rows where queued_revision = revision.
  queuedRevision: number | null
  queuedSnapshot: QueuedSnapshot | null
  sendAt: Date | null
  sentAt: Date | null
  outcome: 'sent' | 'simulated' | null
  error: string | null
  messageId: string | null
  revisionNote: string | null
  // Set when the draft answers an inbound mail: sent in its OpenMail thread, revised server side.
  inboundId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ReplyRow {
  id: string
  draftId: string
  // Message-ID of the reply itself: polling dedupes on it.
  messageId: string
  inReplyTo: string | null
  fromName: string
  fromAddress: string
  subject: string
  body: string
  receivedAt: Date
  agentNote: string | null
  readAt: Date | null
  createdAt: Date
}

// OpenMail inboxes the app listens to. id is the OpenMail inbox id. agentId: whose main chat gets
// the notices and drafts (null: the host's always-on assistant).
export interface AddressRow {
  id: string
  address: string
  displayName: string | null
  kind: AddressKind
  agentId: string | null
  createdAt: Date
  updatedAt: Date
}

// status: received (stored, not handled yet), handled (classified, owner notified unless noise),
// done (the owner finished it).
export interface InboundRow {
  id: string
  openmailMessageId: string
  threadId: string
  addressId: string
  toAddress: string
  fromAddress: string
  fromName: string
  subject: string
  body: string
  attachments: InboundAttachment[]
  receivedAt: Date
  status: 'received' | 'handled' | 'done'
  category: InboundCategory | null
  summary: string | null
  suggestedAction: string | null
  // Intake only: the mail came from the owner's own address with DMARC pass.
  trusted: boolean
  conversationId: string | null
  digestedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
