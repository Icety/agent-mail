import type { MailDraft, QueuedSnapshot } from './types'

export const snapshot = (draft: Pick<MailDraft, 'from' | 'to' | 'cc' | 'subject' | 'body' | 'revision'>): QueuedSnapshot => ({
  from: draft.from,
  to: [...draft.to],
  cc: [...draft.cc],
  subject: draft.subject,
  body: draft.body,
  revision: draft.revision,
})
