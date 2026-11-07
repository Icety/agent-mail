import type { MailDraft, MailReply, MailSender, MailState } from '../../shared/types'
import type { MailApi, MailDraftAction } from './mailApi'
import type { MailScope } from './mailView'

// A pretend mail server in the browser, seeded with sample data, for the /mail/states style page.
// It never sends anything: Send queues for 10 s and then marks the draft "simulated".
export const createMailDemoApi = (seed: { drafts: MailDraft[], replies: MailReply[], senders: MailSender[] }, onChange: (draft: MailDraft) => void): MailApi => {
  const drafts = new Map(seed.drafts.map(d => [d.id, structuredClone(d)]))
  const replies = new Map(seed.replies.map(r => [r.id, structuredClone(r)]))
  let senders = seed.senders.map(s => structuredClone(s))
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const inScope = (d: MailDraft, scope: MailScope) =>
    (!scope.conversationId || d.conversationId === scope.conversationId) && (!scope.agentId || d.agentId === scope.agentId)
  const find = (id: string): MailDraft => {
    const draft = drafts.get(id)
    if (!draft) throw Object.assign(new Error('Draft not found'), { statusCode: 404 })
    return draft
  }
  const save = (draft: MailDraft, patch: Partial<MailDraft>): MailDraft => {
    const next = { ...draft, ...patch, updatedAt: new Date().toISOString() }
    drafts.set(next.id, next)
    return structuredClone(next)
  }
  const later = (id: string, ms: number, run: () => MailDraft | null) => {
    clearTimeout(timers.get(id))
    timers.set(id, setTimeout(() => {
      const next = run()
      if (next) onChange(next)
    }, ms))
  }
  const toState = (state: MailState) => (d: MailDraft) => save(d, { state })

  const actions: Record<MailDraftAction, (d: MailDraft, body: Record<string, unknown>) => MailDraft> = {
    send: (d) => {
      const sendAt = new Date(Date.now() + 10_000).toISOString()
      later(d.id, 10_000, () => {
        const current = drafts.get(d.id)
        if (current?.state !== 'queued') return null
        return save(current, { state: 'sent', outcome: 'simulated', sentAt: new Date().toISOString(), error: null })
      })
      return save(d, { state: 'queued', queuedRevision: d.revision, sendAt, error: null })
    },
    undo: d => save(d, { state: 'edited', sendAt: null, queuedRevision: null }),
    'mark-sent': d => save(d, { state: 'sent', outcome: 'sent', sentAt: new Date().toISOString(), error: null }),
    discard: toState('discarded'),
    restore: toState('edited'),
    'stop-revise': d => save(d, { state: 'edited', revisionNote: null }),
    revise: (d, body) => {
      later(d.id, 5_000, () => {
        const current = drafts.get(d.id)
        if (current?.state !== 'revising') return null
        return save(current, { state: 'draft', revision: current.revision + 1, revisionNote: null })
      })
      return save(d, { state: 'revising', revisionNote: String(body.note ?? '') })
    },
  }

  return {
    drafts: async scope => [...drafts.values()].filter(d => inScope(d, scope) && d.state !== 'sent').map(d => structuredClone(d)),
    sent: async scope => [...drafts.values()].filter(d => inScope(d, scope) && d.state === 'sent').map(d => structuredClone(d)),
    replies: async scope => [...replies.values()].filter((r) => {
      const draft = drafts.get(r.draftId)
      return draft ? inScope(draft, scope) : false
    }).map(r => structuredClone(r)),
    thread: async draftId => ({ draft: structuredClone(find(draftId)), replies: [...replies.values()].filter(r => r.draftId === draftId) }),
    senders: async agentId => senders.filter(s => s.agentId === agentId).sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
    saveSender: async (input) => {
      const isDefault = input.isDefault ?? false
      if (isDefault) senders = senders.map(s => s.agentId === input.agentId ? { ...s, isDefault: false } : s)
      const existing = senders.find(s => s.agentId === input.agentId && s.address === input.address)
      const saved: MailSender = existing
        ? { ...existing, name: input.name, isDefault }
        : { id: crypto.randomUUID(), agentId: input.agentId, address: input.address, name: input.name, isDefault, createdAt: new Date().toISOString() }
      senders = [...senders.filter(s => s.id !== saved.id), saved]
      return saved
    },
    removeSender: async (id) => { senders = senders.filter(s => s.id !== id) },
    edit: async (id, edit) => {
      const draft = find(id)
      if (edit.revision !== draft.revision) throw Object.assign(new Error('Draft changed. Review the current revision'), { statusCode: 409 })
      clearTimeout(timers.get(id))
      const { revision: _seen, ...fields } = edit
      return save(draft, { ...fields, state: 'edited', revision: draft.revision + 1, sendAt: null, queuedRevision: null })
    },
    act: async (id, action, body) => actions[action](find(id), body ?? {}),
    markRead: async (replyId) => {
      const reply = replies.get(replyId)
      if (!reply) throw Object.assign(new Error('Reply not found'), { statusCode: 404 })
      const next = { ...reply, readAt: new Date().toISOString() }
      replies.set(replyId, next)
      return next
    },
  }
}
