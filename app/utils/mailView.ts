import type { MailDraft, MailReply } from '../../shared/types'
import { formatMailTime } from './mailTime'

// Pure display logic of the mail screens: countdowns, labels, batch progress, grouping.

export interface MailScope {
  conversationId?: string | null
  agentId?: string | null
}

// Seconds left in the undo window, rounded up so "1" shows until the very end. Never negative.
export const mailSecondsLeft = (sendAt: string | null, now: number): number => {
  if (!sendAt) return 0
  const ms = Date.parse(sendAt) - now
  return Number.isNaN(ms) || ms <= 0 ? 0 : Math.ceil(ms / 1000)
}

// Length of the undo window this draft got, for the countdown ring.
export const mailWindowSeconds = (draft: Pick<MailDraft, 'sendAt' | 'updatedAt'>): number => {
  if (!draft.sendAt) return 10
  const seconds = Math.round((Date.parse(draft.sendAt) - Date.parse(draft.updatedAt)) / 1000)
  return Number.isFinite(seconds) && seconds > 0 && seconds <= 120 ? seconds : 10
}

// "iCulture · Outreach" -> "iCulture"; the second part is where it lives ("Outreach").
export const mailContextParts = (label: string | null): { name: string | null, place: string | null } => {
  if (!label) return { name: null, place: null }
  const [name, ...rest] = label.split(' · ').map(s => s.trim())
  return { name: name || null, place: rest.join(' · ') || null }
}

// Who a draft goes to, as a short name: the context name for one recipient, else the address.
export const mailRecipientName = (draft: Pick<MailDraft, 'to' | 'contextLabel'>): string => {
  if (draft.to.length > 1) return `${draft.to.length} recipients`
  return mailContextParts(draft.contextLabel).name ?? draft.to[0] ?? 'nobody'
}

export const mailInitials = (name: string): string => {
  // "Marieke, Hoormij" is a person at an organisation: her initial only.
  const words = (name.split(',')[0] ?? name).replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words.at(-1)?.[0] ?? '' : '')).toUpperCase()
}

// Drafts still waiting for the owner's decision (the ones a batch review walks through).
export const MAIL_REVIEWABLE: MailDraft['state'][] = ['draft', 'edited', 'failed']
export const isMailReviewable = (draft: MailDraft): boolean => MAIL_REVIEWABLE.includes(draft.state)

// What happened to one sent mail, in words that never overclaim.
export interface MailOutcomeLabel {
  label: string
  // For a pill: "Simulated", "Delivered".
  short: string
  tone: 'ok' | 'neutral' | 'warn' | 'error' | 'reply'
  icon: string
}

export const mailOutcomeLabel = (draft: Pick<MailDraft, 'state' | 'outcome'>, replied = false): MailOutcomeLabel => {
  if (draft.state === 'unknown') return { label: 'Delivery unknown, check before resending', short: 'Unknown', tone: 'warn', icon: 'i-lucide-circle-help' }
  if (draft.state === 'failed') return { label: 'Not sent', short: 'Not sent', tone: 'error', icon: 'i-lucide-circle-alert' }
  if (draft.state === 'queued') return { label: 'Queued, not sent yet', short: 'Queued', tone: 'neutral', icon: 'i-lucide-clock' }
  if (draft.state === 'sending') return { label: 'Sending', short: 'Sending', tone: 'neutral', icon: 'i-lucide-loader' }
  if (draft.state !== 'sent') return { label: 'Not sent', short: 'Not sent', tone: 'neutral', icon: 'i-lucide-mail' }
  if (draft.outcome === 'simulated') return { label: 'Simulated (no mail server configured)', short: 'Simulated', tone: 'neutral', icon: 'i-lucide-flask-conical' }
  if (replied) return { label: 'Replied', short: 'Replied', tone: 'reply', icon: 'i-lucide-reply' }
  return { label: 'Delivered', short: 'Delivered', tone: 'ok', icon: 'i-lucide-check-check' }
}

// Batch review: where each draft of the batch stands. Queued is never counted as sent, and a
// simulated send (no mail server) never as a real one.
export type MailBatchStatus = 'pending' | 'skipped' | 'queued' | 'sent' | 'simulated' | 'failed' | 'revising' | 'discarded' | 'unknown'
// What the owner did with it in this review.
export type MailBatchDecision = 'skipped' | 'sent' | null

export const mailBatchStatus = (draft: MailDraft | undefined, decision: MailBatchDecision): MailBatchStatus => {
  if (!draft) return 'discarded'
  switch (draft.state) {
    case 'queued':
    case 'sending': return 'queued'
    case 'sent': return draft.outcome === 'simulated' ? 'simulated' : 'sent'
    case 'discarded': return 'discarded'
    case 'revising': return 'revising'
    case 'unknown': return 'unknown'
    // Failed before the review started: still to decide. Failed after Send here: not sent.
    case 'failed': return decision === 'sent' ? 'failed' : decision === 'skipped' ? 'skipped' : 'pending'
    // Undo puts a sent-in-this-review draft back here: pending again.
    default: return decision === 'skipped' ? 'skipped' : 'pending'
  }
}

const SUMMARY_ORDER: [Exclude<MailBatchStatus, 'pending'>, string][] = [
  ['sent', 'sent'],
  ['simulated', 'simulated'],
  ['queued', 'queued'],
  ['failed', 'not sent'],
  ['unknown', 'unknown'],
  ['revising', 'being revised'],
  ['skipped', 'skipped'],
  ['discarded', 'discarded'],
]

// "1 sent, 1 queued, 1 skipped". Pending drafts are left out.
export const mailBatchSummary = (statuses: MailBatchStatus[]): string => {
  const parts = SUMMARY_ORDER
    .map(([status, word]) => [statuses.filter(s => s === status).length, word] as const)
    .filter(([count]) => count > 0)
    .map(([count, word]) => `${count} ${word}`)
  return parts.length ? parts.join(', ') : 'Nothing sent'
}

// Next draft to look at after the current one: the first pending one after it, wrapping around.
export const mailNextPending = (statuses: MailBatchStatus[], from: number): number | null => {
  for (let step = 1; step <= statuses.length; step++) {
    const i = (from + step) % statuses.length
    if (statuses[i] === 'pending') return i
  }
  return null
}

// Previous or next mail in an open list. When the open one left the list (discarded), lastIndex
// is where it was, so the mail that slid into its place is next.
export const mailStep = (ids: string[], current: string, lastIndex: number, step: 1 | -1): string | null => {
  const i = ids.indexOf(current)
  const target = i >= 0 ? i + step : step === 1 ? lastIndex : lastIndex - 1
  return ids[target] ?? null
}

// Drafts an agent wrote in one go (within 10 minutes of each other) show as one stack in chat.
export const mailDraftRuns = (drafts: MailDraft[], gapMs = 10 * 60_000): MailDraft[][] => {
  const sorted = [...drafts].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : 1))
  const runs: MailDraft[][] = []
  for (const draft of sorted) {
    const run = runs.at(-1)
    const last = run?.at(-1)
    if (run && last && Date.parse(draft.createdAt) - Date.parse(last.createdAt) <= gapMs) run.push(draft)
    else runs.push([draft])
  }
  return runs
}

// The newer of two copies of a draft (a fetch can answer after an action already updated it).
export const mailNewer = <T extends { updatedAt: string }>(a: T | undefined, b: T): T =>
  a && Date.parse(a.updatedAt) > Date.parse(b.updatedAt) ? a : b

// Sent tab: replied mails first, then by Amsterdam day, newest first.
export interface MailSentGroup {
  key: string
  label: string
  drafts: MailDraft[]
}

export const mailSentGroups = (sent: MailDraft[], replies: MailReply[], dayLabel: (iso: string) => string): MailSentGroup[] => {
  const replied = new Set(replies.map(r => r.draftId))
  const byNewest = [...sent].sort((a, b) => Date.parse(b.sentAt ?? b.updatedAt) - Date.parse(a.sentAt ?? a.updatedAt))
  const groups: MailSentGroup[] = []
  const repliedDrafts = byNewest.filter(d => replied.has(d.id))
  if (repliedDrafts.length) groups.push({ key: 'replied', label: 'Replied', drafts: repliedDrafts })
  for (const draft of byNewest.filter(d => !replied.has(d.id))) {
    const label = dayLabel(draft.sentAt ?? draft.updatedAt)
    const group = groups.find(g => g.key === `day:${label}`)
    if (group) group.drafts.push(draft)
    else groups.push({ key: `day:${label}`, label, drafts: [draft] })
  }
  return groups
}

// "14:30" today, "Wed 14 Oct 15:58" before, in Amsterdam time.
export const mailWhen = (iso: string | null, now: Date = new Date()): string => {
  if (!iso) return ''
  const time = formatMailTime(iso, 'time')
  return formatMailTime(iso, 'day', now) === formatMailTime(now, 'day', now) ? time : `${formatMailTime(iso, 'day', now)} ${time}`
}
