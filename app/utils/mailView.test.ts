import { expect, test } from 'bun:test'
import type { MailDraft } from '../../shared/types'
import { sampleDrafts } from '../../shared/fixtures'
import { MAIL_OFFLINE_LOAD, mailErrorMessage } from './mailApi'
import { mailBatchStatus, mailBatchSummary, mailNextPending, mailOutcomeLabel, mailSecondsLeft, mailStep, type MailBatchDecision } from './mailView'

const base = sampleDrafts[0] as MailDraft
const withState = (state: MailDraft['state'], outcome: MailDraft['outcome'] = state === 'sent' ? 'sent' : null): MailDraft => ({ ...base, state, outcome })

test('the undo countdown rounds up, so it never shows 0 while the send can still be undone', () => {
  const now = Date.parse('2026-10-15T12:29:00.000Z')
  expect(mailSecondsLeft('2026-10-15T12:29:09.001Z', now)).toBe(10)
  expect(mailSecondsLeft('2026-10-15T12:29:00.200Z', now)).toBe(1)
  expect(mailSecondsLeft('2026-10-15T12:29:00.000Z', now)).toBe(0)
  expect(mailSecondsLeft('2026-10-15T12:28:50.000Z', now)).toBe(0)
  expect(mailSecondsLeft(null, now)).toBe(0)
})

test('a batch counts real outcomes: queued and simulated are never sent, undo makes a draft pending again', () => {
  const cases: [MailDraft['state'], MailBatchDecision, string][] = [
    ['sent', 'sent', 'sent'],
    ['queued', 'sent', 'queued'],
    ['sending', 'sent', 'queued'],
    ['edited', 'sent', 'pending'],
    ['failed', null, 'pending'],
    ['failed', 'sent', 'failed'],
    ['draft', 'skipped', 'skipped'],
    ['revising', null, 'revising'],
  ]
  for (const [state, decision, expected] of cases) expect(`${state}/${decision}: ${mailBatchStatus(withState(state), decision)}`).toBe(`${state}/${decision}: ${expected}`)
  expect(mailBatchStatus(withState('sent', 'simulated'), 'sent')).toBe('simulated')

  expect(mailBatchSummary(['sent', 'queued', 'skipped', 'pending'])).toBe('1 sent, 1 queued, 1 skipped')
  expect(mailBatchSummary(['queued', 'queued', 'failed'])).toBe('2 queued, 1 not sent')
  expect(mailBatchSummary(['simulated', 'sent'])).toBe('1 sent, 1 simulated')
  expect(mailNextPending(['pending', 'queued', 'skipped'], 0)).toBe(0)
  expect(mailNextPending(['queued', 'skipped', 'pending'], 2)).toBe(2)
  expect(mailNextPending(['queued', 'pending', 'pending'], 1)).toBe(2)
  expect(mailNextPending(['queued', 'sent'], 0)).toBeNull()
})

test('sent mail never claims more than the transport did', () => {
  expect(mailOutcomeLabel(withState('sent', 'simulated')).label).toBe('Simulated (no mail server configured)')
  expect(mailOutcomeLabel(withState('sent', 'simulated'), true).label).toBe('Simulated (no mail server configured)')
  expect(mailOutcomeLabel(withState('unknown')).label).toBe('Delivery unknown, check before resending')
  expect(mailOutcomeLabel(withState('queued')).label).toBe('Queued, not sent yet')
  expect(mailOutcomeLabel(withState('sent', 'sent')).label).toBe('Delivered')
  expect(mailOutcomeLabel(withState('sent', 'sent'), true).label).toBe('Replied')
})

test('mail errors read as sentences: offline, gone, busy or the server reason, never a URL', () => {
  const fetchError = (statusCode: number | undefined, statusMessage: string, message = '') => ({ statusCode, statusMessage, message, data: statusCode ? { statusMessage } : undefined })
  expect(mailErrorMessage(fetchError(undefined, '', '[PATCH] "/api/mail/drafts/x": <no response> Failed to fetch'), MAIL_OFFLINE_LOAD)).toBe(MAIL_OFFLINE_LOAD)
  expect(mailErrorMessage(fetchError(404, 'Draft not found'))).toBe('This mail no longer exists.')
  expect(mailErrorMessage(fetchError(502, 'Bad Gateway'))).toBe('The server could not do that right now. Try again in a moment.')
  expect(mailErrorMessage(fetchError(400, 'Choose a configured sender for this agent'))).toBe('Choose a configured sender for this agent.')
  expect(mailErrorMessage(fetchError(400, '[POST] "/api/mail/senders": 400'))).toBe('That did not work. Try again.')
})

test('stepping through open mail stops at the ends and does not skip a mail when the open one left the list', () => {
  const ids = ['a', 'b', 'c']
  expect(mailStep(ids, 'b', 1, 1)).toBe('c')
  expect(mailStep(ids, 'b', 1, -1)).toBe('a')
  expect(mailStep(ids, 'a', 0, -1)).toBeNull()
  expect(mailStep(ids, 'c', 2, 1)).toBeNull()
  // 'x' was at index 1 and was discarded: 'b' slid into its place.
  expect(mailStep(['a', 'b', 'c'], 'x', 1, 1)).toBe('b')
  expect(mailStep(['a', 'b', 'c'], 'x', 1, -1)).toBe('a')
  expect(mailStep(['a'], 'x', 1, 1)).toBeNull()
})
