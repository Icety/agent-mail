import type { editDraftSchema, senderSchema } from '../../shared/types'
import type { MailDraft, MailReply, MailSender, MailThread } from '../../shared/types'
import type { z } from 'zod'
import type { MailScope } from './mailView'

export type MailEdit = z.input<typeof editDraftSchema>
export type MailDraftAction = 'send' | 'undo' | 'discard' | 'restore' | 'revise' | 'stop-revise' | 'mark-sent'
export type MailSenderInput = z.input<typeof senderSchema>

// Every mail request the screens make, in one place. `mailHttpApi` talks to the server; the demo
// API (mailDemoApi.ts) answers from the shared fixtures for the style page.
export interface MailApi {
  drafts: (scope: MailScope) => Promise<MailDraft[]>
  sent: (scope: MailScope) => Promise<MailDraft[]>
  replies: (scope: MailScope) => Promise<MailReply[]>
  thread: (draftId: string) => Promise<MailThread>
  senders: (agentId: string) => Promise<MailSender[]>
  // Adds a sender, or updates the one with the same address (name, default).
  saveSender: (input: MailSenderInput) => Promise<MailSender>
  removeSender: (id: string) => Promise<void>
  edit: (id: string, edit: MailEdit) => Promise<MailDraft>
  act: (id: string, action: MailDraftAction, body?: Record<string, unknown>) => Promise<MailDraft>
  markRead: (replyId: string) => Promise<MailReply>
}

const query = (scope: MailScope): Record<string, string> => {
  const q: Record<string, string> = {}
  if (scope.conversationId) q.conversation = scope.conversationId
  if (scope.agentId) q.agent = scope.agentId
  return q
}

export const mailHttpApi: MailApi = {
  drafts: scope => $fetch<MailDraft[]>('/api/mail/drafts', { query: query(scope) }),
  sent: scope => $fetch<MailDraft[]>('/api/mail/sent', { query: query(scope) }),
  replies: scope => $fetch<MailReply[]>('/api/mail/replies', { query: query(scope) }),
  thread: draftId => $fetch<MailThread>(`/api/mail/threads/${encodeURIComponent(draftId)}`),
  senders: agentId => $fetch<MailSender[]>('/api/mail/senders', { query: { agent: agentId } }),
  saveSender: input => $fetch<MailSender>('/api/mail/senders', { method: 'POST', body: input }),
  removeSender: async (id) => { await $fetch(`/api/mail/senders/${encodeURIComponent(id)}`, { method: 'DELETE' }) },
  edit: (id, edit) => $fetch<MailDraft>(`/api/mail/drafts/${encodeURIComponent(id)}`, { method: 'PATCH', body: edit }),
  act: (id, action, body) => $fetch<MailDraft>(`/api/mail/drafts/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: body ?? {} }),
  markRead: replyId => $fetch<MailReply>(`/api/mail/replies/${encodeURIComponent(replyId)}/read`, { method: 'POST' }),
}

export const MAIL_OFFLINE_LOAD = 'You are offline. Mail loads when you are back.'
export const MAIL_OFFLINE_ACTION = 'You are offline. Try again when you are back.'

// A sentence the owner can act on, never a URL or a stack: offline, gone, busy, or the server's own
// reason when it is written for people (the mail server's 4xx messages are).
export const mailErrorMessage = (err: unknown, offline: string = MAIL_OFFLINE_ACTION): string => {
  const e = err as { data?: { message?: string, statusMessage?: string }, statusMessage?: string, message?: string } | null
  const status = mailErrorStatus(err)
  const raw = String([e?.data?.statusMessage, e?.data?.message, e?.statusMessage, e?.message].find(Boolean) ?? '')
  const sentence = (text: string) => /[.!?]$/.test(text) ? text : `${text}.`
  const isOffline = (import.meta.client && typeof navigator !== 'undefined' && navigator.onLine === false)
    || (!status && /failed to fetch|networkerror|no response|load failed|network request failed/i.test(raw))
  if (isOffline) return offline
  if (status === 404) return 'This mail no longer exists.'
  if (status && status >= 500) return 'The server could not do that right now. Try again in a moment.'
  const readable = raw && raw.length < 160 && !/\/api\/|\[(GET|POST|PATCH|DELETE|PUT)\]|<|\{/.test(raw)
  if (status && status >= 400 && readable) return sentence(raw)
  return 'That did not work. Try again.'
}

export const mailErrorStatus = (err: unknown): number | undefined =>
  (err as { statusCode?: number, status?: number })?.statusCode ?? (err as { status?: number })?.status
