import { expect, test } from 'bun:test'
import { transition } from './state'
import type { MailAction, MailState } from './types'

test('mail transitions keep delivery behind explicit authorization and freeze claimed mail', () => {
  const cases: { state: MailState; action: MailAction; next: MailState | null; revision?: number; queuedRevision?: number }[] = [
    { state: 'draft', action: { type: 'send', revision: 1, sendAt: '2026-10-15T12:30:10Z' }, next: 'queued' },
    { state: 'edited', action: { type: 'send', revision: 1, sendAt: '' }, revision: 2, next: null },
    { state: 'revising', action: { type: 'send', revision: 1, sendAt: '' }, next: null },
    { state: 'sent', action: { type: 'send', revision: 1, sendAt: '' }, next: null },
    { state: 'unknown', action: { type: 'send', revision: 1, sendAt: '' }, next: 'queued' },
    { state: 'queued', action: { type: 'edit' }, next: 'edited' },
    { state: 'queued', action: { type: 'undo' }, next: 'edited' },
    { state: 'queued', action: { type: 'claim' }, queuedRevision: 1, next: 'sending' },
    { state: 'queued', action: { type: 'claim' }, queuedRevision: 2, next: null },
    { state: 'sending', action: { type: 'edit' }, next: null },
    { state: 'sending', action: { type: 'undo' }, next: null },
    { state: 'sending', action: { type: 'discard' }, next: null },
    { state: 'sending', action: { type: 'delivered', outcome: 'simulated' }, next: 'sent' },
    { state: 'sending', action: { type: 'fail', error: 'Rejected' }, next: 'failed' },
    { state: 'sending', action: { type: 'interrupted' }, next: 'unknown' },
    { state: 'draft', action: { type: 'discard' }, next: 'discarded' },
    { state: 'discarded', action: { type: 'restore' }, next: 'edited' },
    { state: 'draft', action: { type: 'revise', note: 'Shorter' }, next: 'revising' },
    { state: 'revising', action: { type: 'stopRevise' }, next: 'edited' },
    { state: 'edited', action: { type: 'agentRevision', baseRevision: 1 }, revision: 2, next: null },
    { state: 'revising', action: { type: 'agentRevision', baseRevision: 1 }, next: 'draft' },
    { state: 'queued', action: { type: 'agentRevision', baseRevision: 1 }, next: null },
  ]
  for (const row of cases) {
    const result = transition({ state: row.state, revision: row.revision ?? 1, queuedRevision: row.queuedRevision ?? null }, row.action)
    expect(result.ok ? result.state : null).toBe(row.next)
  }
})
