import { z } from 'zod'

// Wire types, the transport contract and request schemas of agent mail. Times are ISO (UTC).
// "The owner" is the person whose mail this is (Thomas in Koopa, Sanne in Toadette).

// draft: as the agent wrote it. edited: the owner changed it. revising: the agent is rewriting it.
// queued: Send pressed, waiting out the undo window (not sent!). sending: claimed by the scheduler,
// no more edits. sent: delivered (or simulated, see outcome). failed: the transport said no.
// discarded: thrown away (restorable). unknown: the app restarted mid-send; check before resending.
export const MAIL_STATES = ['draft', 'edited', 'revising', 'queued', 'sending', 'sent', 'failed', 'discarded', 'unknown'] as const
export type MailState = typeof MAIL_STATES[number]

// 'simulated': the log transport (no mail server configured) pretended to send it.
export const MAIL_OUTCOMES = ['sent', 'simulated', 'failed'] as const
export type MailOutcome = typeof MAIL_OUTCOMES[number]

// What was authorised by Send: the exact revision and recipients. The scheduler sends this, not
// the live row.
export interface QueuedSnapshot {
  previousState?: 'draft' | 'edited' | 'failed' | 'unknown'
  previousError?: string | null
  from: string
  to: string[]
  cc: string[]
  subject: string
  body: string
  revision: number
}

export interface MailDraft {
  id: string
  agentId: string
  conversationId: string | null
  from: string
  to: string[]
  cc: string[]
  subject: string
  body: string
  // The chip on the card, e.g. "iCulture · Outreach", and where it links to.
  contextLabel: string | null
  contextHref: string | null
  state: MailState
  // Goes up on every edit (owner or agent). Send and agent revisions name the revision they saw.
  revision: number
  queuedRevision: number | null
  sendAt: string | null
  sentAt: string | null
  outcome: Exclude<MailOutcome, 'failed'> | null
  error: string | null
  messageId: string | null
  // What the owner asked the agent to change while revising ("shorter, more personal").
  revisionNote: string | null
  // The inbound mail this draft answers (OpenMail), if any.
  inboundId: string | null
  createdAt: string
  updatedAt: string
}

export interface MailReply {
  id: string
  draftId: string
  messageId: string
  fromName: string
  fromAddress: string
  subject: string
  body: string
  receivedAt: string
  // What the agent did about it ("Marked Hoormij as replied in Outreach").
  agentNote: string | null
  readAt: string | null
}

export interface MailSender {
  id: string
  agentId: string
  address: string
  name: string
  isDefault: boolean
  createdAt: string
}

// GET /api/mail/threads/:draftId: the sent draft and its replies, oldest first.
export interface MailThread {
  draft: MailDraft
  replies: MailReply[]
}

// A draft or a sent thread opened from the mail panel (a host can show it outside the panel).
export interface MailOpenTarget {
  kind: 'draft' | 'thread'
  id: string
}

// The pure state machine: transition(draft, action) in shared/state.ts.
export type MailAction =
  | { type: 'edit' }
  | { type: 'send', revision: number, sendAt: string }
  | { type: 'undo', previousState?: QueuedSnapshot['previousState'] }
  | { type: 'claim' }
  | { type: 'delivered', outcome: 'sent' | 'simulated', messageId?: string }
  | { type: 'fail', error: string }
  | { type: 'interrupted' }
  | { type: 'discard' }
  | { type: 'markSent' }
  | { type: 'restore' }
  | { type: 'revise', note: string }
  | { type: 'stopRevise' }
  | { type: 'agentRevision', baseRevision: number }

export type MailTransition =
  | { ok: true, state: MailState }
  | { ok: false, reason: string }

// Transports (server side). `log` is the default and never sends; `smtp` (nodemailer) only when
// runtimeConfig.mail.smtpUrl is set; `openmail` when runtimeConfig.mail.openmail.apiKey is set. A host
// may pass its own (e.g. Gmail API) with any name.
export interface OutgoingMail {
  from: string
  to: string[]
  cc: string[]
  subject: string
  body: string
  inReplyTo?: string
  references?: string[]
  // OpenMail: reply inside this thread, and a stable key so a retry never sends twice.
  threadId?: string
  idempotencyKey?: string
}

export interface TransportResult {
  outcome: MailOutcome
  messageId?: string
  error?: string
}

export interface MailTransport {
  name: 'log' | 'smtp' | 'openmail' | (string & {})
  send: (mail: OutgoingMail) => Promise<TransportResult>
}

export interface MailAuthorization {
  agentId: string
  action: 'createDraft' | 'reviseDraft' | 'readDrafts' | 'readReplies' | 'noteReply' | 'readInbox' | 'doneInbound'
  allowed: boolean
}

// Request schemas (validate in the route handler).

const address = z.email()
const revision = z.number().int().min(1)

export const draftsQuerySchema = z.object({
  conversation: z.string().min(1).optional(),
  agent: z.string().min(1).optional(),
})

export const repliesQuerySchema = z.object({
  conversation: z.string().min(1).optional(),
  agent: z.string().min(1).optional(),
  unread: z.enum(['1', 'true']).optional(),
})

// PATCH /api/mail/drafts/:id: the owner edits. Rejected (409) when `revision` is not current.
export const editDraftSchema = z.object({
  revision,
  from: address.optional(),
  to: z.array(address).min(1).optional(),
  cc: z.array(address).optional(),
  subject: z.string().max(500).optional(),
  body: z.string().max(100_000).optional(),
})

// POST /api/mail/drafts/:id/send: authorises exactly this revision.
export const sendDraftSchema = z.object({ revision })

// POST /api/mail/drafts/:id/revise: ask the agent to rewrite it.
export const reviseDraftSchema = z.object({ note: z.string().trim().min(1).max(1_000) })

// POST /api/internal/mail/drafts: the agent writes a draft in its conversation.
export const createDraftSchema = z.object({
  conversationId: z.string().min(1),
  // Defaults to the agent's default sender.
  from: address.optional(),
  to: z.array(address).min(1),
  cc: z.array(address).default([]),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(100_000),
  contextLabel: z.string().max(120).optional(),
  contextHref: z.string().max(500).optional(),
})

// POST /api/internal/mail/drafts/:id/revision: rejected when the owner edited since baseRevision.
export const agentRevisionSchema = z.object({
  baseRevision: revision,
  from: address.optional(),
  to: z.array(address).min(1).optional(),
  cc: z.array(address).optional(),
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).max(100_000).optional(),
})

// POST /api/mail/senders
export const senderSchema = z.object({
  agentId: z.string().min(1),
  address,
  name: z.string().trim().min(1).max(120),
  isDefault: z.boolean().default(false),
})

// POST /api/internal/mail/replies/:id/note
export const replyNoteSchema = z.object({ note: z.string().trim().min(1).max(1_000) })

// Inbound mail (OpenMail). An address's kind decides how its mail is handled:
// owner: personal (e.g. sam@<domain>), always flagged for the owner. project: hello@, support@.
// intake: the owner forwards mail here with an instruction on top. reports: DMARC reports, digest only.
export const ADDRESS_KINDS = ['owner', 'project', 'intake', 'reports'] as const
export type AddressKind = typeof ADDRESS_KINDS[number]
export const INBOUND_CATEGORIES = ['owner', 'project', 'noise', 'intake'] as const
export type InboundCategory = typeof INBOUND_CATEGORIES[number]

export interface InboundAttachment {
  filename: string
  contentType: string
  sizeBytes: number
}

export interface MailAddress {
  id: string
  address: string
  displayName: string | null
  kind: AddressKind
  agentId: string | null
}

// One inbound mail. body is sanitized plain text: show it as text, never as HTML.
export interface IncomingMail {
  id: string
  threadId: string
  toAddress: string
  fromAddress: string
  fromName: string
  subject: string
  body: string
  attachments: InboundAttachment[]
  receivedAt: string
  status: 'received' | 'handled' | 'done'
  category: InboundCategory | null
  summary: string | null
  suggestedAction: string | null
  trusted: boolean
  conversationId: string | null
  drafts: { id: string, state: MailState }[]
}

// Inbox views. inbox: waiting for the owner (not done, not noise). noise: low priority, filtered out
// of the inbox (newsletters, DMARC reports, bounces), still listed and in the daily digest.
export const INBOUND_VIEWS = ['inbox', 'noise', 'done', 'all'] as const
export type InboundView = typeof INBOUND_VIEWS[number]
export const inboundQuerySchema = z.object({ view: z.enum(INBOUND_VIEWS).default('inbox') })

// Agent routes under /api/internal/mail/inbound. Who asks: the agent, or the chat it works in
// (one of the two, like draftsQuerySchema). `view` as above (default inbox); `done=1` is the
// older spelling of `view=all`. `from` is a substring of the sender's address or name.
export const agentInboundQuerySchema = z.object({
  conversation: z.string().min(1).optional(),
  agent: z.string().min(1).optional(),
  view: z.enum(INBOUND_VIEWS).optional(),
  done: z.enum(['0', '1', 'true', 'false']).optional(),
  from: z.string().trim().max(200).optional(),
})
export const agentInboundDoneSchema = z.object({
  conversation: z.string().min(1).optional(),
  agent: z.string().min(1).optional(),
}).default({})

// POST /api/mail/inbound/:id/draft: the owner's instruction for the reply.
export const draftReplySchema = z.object({ instruction: z.string().trim().max(2_000).default('') })

// PATCH /api/mail/addresses/:id
export const addressSchema = z.object({
  kind: z.enum(ADDRESS_KINDS).optional(),
  agentId: z.string().min(1).nullable().optional(),
})

// Other parts of the host identify project agents without mail depending on them.
export interface MailAgentScope {
  agentIds: string[]
  projectAgentIds: Set<string>
}

// Live topics. A host forwards them to its own live channel (SSE, WebSocket) and back to
// useMailLive on the client.
export interface MailTopicMap {
  // A draft was created, edited, queued, sent, failed, discarded, ...
  'mail.draft': { draftId: string, conversationId: string | null, state: string }
  // A reply came in (or was marked read).
  'mail.reply': { replyId: string, draftId: string }
  // An inbound mail arrived, was handled or marked done.
  'mail.inbound': { inboundId: string }
  // Counts in the summary changed.
  'mail.summary': Record<string, never>
}

// GET /api/mail/summary: what needs the owner, what was sent lately, and badge counts. Shaped so
// a host can merge it into its own home screen.
export type MailTone = 'mail' | 'reply' | 'neutral'
export interface MailNeed {
  id: string
  tone: MailTone
  icon: string
  title: string
  detail: string
  action: { label: string, to: string }
}
export interface MailChange {
  id: string
  at: string
  icon: string
  tone: MailTone
  title: string
  source: string
  to?: string
}
// One slip into the inbox on the home screen, always there when OpenMail is on.
export interface MailSlip {
  tone: MailTone
  icon: string
  label: string
  title: string
  meta?: string
  badges?: { label: string, tone: MailTone }[]
  to: string
}
export interface MailSummary {
  needs: MailNeed[]
  slip?: MailSlip
  changed: MailChange[]
  // nav 'mail': everything waiting; nav 'projects': only agents a host's agentScope marked.
  badges: { nav: string, count: number, tone: MailTone }[]
}
