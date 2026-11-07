import type { AddressRow, DraftRow, InboundRow, ReplyRow, SenderRow } from './rows'
import type { IncomingMail, MailAddress, MailDraft, MailReply, MailSender } from '../shared/types'

// Stored rows to the JSON the routes answer with (ISO times).

export const draftWire = (row: DraftRow): MailDraft => ({
  id: row.id, agentId: row.agentId, conversationId: row.conversationId, from: row.fromAddress,
  to: row.to, cc: row.cc, subject: row.subject, body: row.body, contextLabel: row.contextLabel,
  contextHref: row.contextHref, state: row.state, revision: row.revision, queuedRevision: row.queuedRevision,
  sendAt: row.sendAt?.toISOString() ?? null, sentAt: row.sentAt?.toISOString() ?? null,
  outcome: row.outcome, error: row.error, messageId: row.messageId, revisionNote: row.revisionNote, inboundId: row.inboundId,
  createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
})

export const replyWire = (row: ReplyRow): MailReply => ({
  id: row.id, draftId: row.draftId, messageId: row.messageId, fromName: row.fromName,
  fromAddress: row.fromAddress, subject: row.subject, body: row.body,
  receivedAt: row.receivedAt.toISOString(), agentNote: row.agentNote, readAt: row.readAt?.toISOString() ?? null,
})

export const senderWire = (row: SenderRow): MailSender => ({
  id: row.id, agentId: row.agentId, address: row.address, name: row.name, isDefault: row.isDefault, createdAt: row.createdAt.toISOString(),
})

export const addressWire = (row: AddressRow): MailAddress => ({
  id: row.id, address: row.address, displayName: row.displayName, kind: row.kind, agentId: row.agentId,
})

export const inboundWire = (row: InboundRow, linked: { id: string, state: IncomingMail['drafts'][number]['state'] }[] = []): IncomingMail => ({
  id: row.id, threadId: row.threadId, toAddress: row.toAddress, fromAddress: row.fromAddress, fromName: row.fromName,
  subject: row.subject, body: row.body, attachments: row.attachments, receivedAt: row.receivedAt.toISOString(),
  status: row.status, category: row.category, summary: row.summary, suggestedAction: row.suggestedAction,
  trusted: row.trusted, conversationId: row.conversationId, drafts: linked,
})
