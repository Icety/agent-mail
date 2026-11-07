import type { MailAction, MailDraft, MailState, MailTransition } from './types'

const editable: MailState[] = ['draft', 'edited', 'revising', 'queued', 'failed']
const sendable: MailState[] = ['draft', 'edited', 'failed', 'unknown']

export const transition = (draft: Pick<MailDraft, 'state' | 'revision' | 'queuedRevision'>, action: MailAction): MailTransition => {
  const accept = (state: MailState): MailTransition => ({ ok: true, state })
  const reject = (reason: string): MailTransition => ({ ok: false, reason })
  if (draft.state === 'unknown' && ['edit', 'revise', 'agentRevision'].includes(action.type)) {
    return reject('Delivery unknown. Check the recipient inbox, then discard, mark as sent or send again')
  }
  switch (action.type) {
    case 'edit': return editable.includes(draft.state) ? accept('edited') : reject('This draft cannot be edited')
    case 'send':
      if (action.revision !== draft.revision) return reject('Draft changed. Review the current revision')
      return sendable.includes(draft.state) ? accept('queued') : reject('This draft cannot be queued')
    case 'undo': return draft.state === 'queued' ? accept(action.previousState ?? 'edited') : reject('This draft is no longer queued')
    case 'claim': return draft.state === 'queued' && draft.queuedRevision === draft.revision ? accept('sending') : reject('Queue authorization is no longer valid')
    case 'delivered': return draft.state === 'sending' ? accept('sent') : reject('This draft is not being sent')
    case 'fail': return draft.state === 'sending' ? accept('failed') : reject('This draft is not being sent')
    case 'interrupted': return draft.state === 'sending' ? accept('unknown') : reject('This draft is not being sent')
    case 'discard': return editable.includes(draft.state) || draft.state === 'unknown' ? accept('discarded') : reject('This draft cannot be discarded')
    case 'markSent': return draft.state === 'unknown' ? accept('sent') : reject('This draft is not delivery unknown')
    case 'restore': return draft.state === 'discarded' ? accept('edited') : reject('This draft is not discarded')
    case 'revise': return editable.includes(draft.state) ? accept('revising') : reject('This draft cannot be revised')
    case 'stopRevise': return draft.state === 'revising' ? accept('edited') : reject('This draft is not being revised')
    case 'agentRevision':
      if (action.baseRevision !== draft.revision) return reject('The owner edited this draft. Read the current revision first')
      return ['draft', 'edited', 'revising'].includes(draft.state) ? accept('draft') : reject('This draft cannot be revised by an agent')
  }
}
