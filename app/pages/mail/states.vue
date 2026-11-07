<script setup lang="ts">
import type { MailDraft } from '../../../shared/types'
import { sampleDrafts, sampleReplies, sampleSenders, sampleSentHoormij } from '../../../shared/fixtures'

// Style page for the mail components: every draft state, the queue, replies, thread, panel and
// batch review, on sample data in a pretend server (nothing is sent). Not linked from the app.
definePageMeta({ hideTabBar: true })
useHead({ title: `Mail states · ${useMailClientHost().appName}` })

const [iculture, tweakers, bright] = sampleDrafts as [MailDraft, MailDraft, MailDraft]
const at = (offsetSeconds: number) => new Date(Date.now() + offsetSeconds * 1000).toISOString()
const gallery = (id: string, base: MailDraft, patch: Partial<MailDraft>): MailDraft =>
  ({ ...base, id, conversationId: 'conv-gallery', ...patch })

const states: { label: string, note?: string, draft: MailDraft }[] = [
  { label: 'New draft', draft: gallery('g-new', iculture, {}) },
  { label: 'Agent revised', note: 'latest version from the agent', draft: gallery('g-revised', bright, { revision: 2, updatedAt: '2026-10-15T12:29:00.000Z' }) },
  { label: 'Edited by you', draft: gallery('g-edited', tweakers, { state: 'edited', revision: 2, updatedAt: '2026-10-15T12:29:00.000Z' }) },
  { label: 'Agent revising', draft: gallery('g-revising', iculture, { state: 'revising', revisionNote: 'shorter, more personal', updatedAt: '2026-10-15T12:29:00.000Z' }) },
  { label: 'Queued', note: '10 s undo window', draft: gallery('g-queued', iculture, { state: 'queued', queuedRevision: 1, sendAt: at(10), updatedAt: at(0) }) },
  { label: 'Sending', note: 'claimed, no more edits', draft: gallery('g-sending', tweakers, { state: 'sending', queuedRevision: 1, sendAt: at(-1), updatedAt: at(-1) }) },
  { label: 'Failed', draft: gallery('g-failed', bright, { state: 'failed', error: 'Mailbox rejected: address not found (550)', updatedAt: '2026-10-15T12:30:00.000Z' }) },
  { label: 'Delivery unknown', note: 'restart mid-send', draft: gallery('g-unknown', bright, { state: 'unknown', updatedAt: '2026-10-15T12:30:00.000Z' }) },
  { label: 'Sent', note: 'tap to expand', draft: gallery('g-sent', iculture, { state: 'sent', outcome: 'sent', sentAt: '2026-10-15T12:30:00.000Z', updatedAt: '2026-10-15T12:30:00.000Z' }) },
  { label: 'Simulated', note: 'no mail server', draft: gallery('g-simulated', tweakers, { state: 'sent', outcome: 'simulated', sentAt: '2026-10-15T12:30:00.000Z', updatedAt: '2026-10-15T12:30:00.000Z' }) },
  { label: 'Discarded', draft: gallery('g-discarded', tweakers, { state: 'discarded' }) },
]
const queueDrafts = [
  gallery('g-q1', iculture, { state: 'queued', queuedRevision: 1, sendAt: at(3), updatedAt: at(-7) }),
  gallery('g-q2', tweakers, { state: 'queued', queuedRevision: 1, sendAt: at(8), updatedAt: at(-2) }),
]

const demo = useMailDemo()
demo.start({
  drafts: [...sampleDrafts, sampleSentHoormij, ...states.map(s => s.draft), ...queueDrafts],
  replies: sampleReplies,
  senders: sampleSenders,
})
onBeforeUnmount(() => demo.stop())

const review = useMailReview()
const thread = ref(false)
const reply = sampleReplies[0]!
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-16 sm:px-8" style="--mail-surface: var(--color-mail-ground)">
    <MailPageHeader title="Mail states" subtitle="Sample data in a pretend server. Nothing is sent." back="/mail" icon="i-lucide-mails" tone="mail" />

    <section class="mt-8">
      <MailSectionHeader title="Draft card" />
      <div class="mt-3 grid grid-cols-1 items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="(s, i) in states" :key="s.draft.id" class="flex flex-col gap-2">
          <p class="text-xs font-semibold text-mail-ink-2">
            {{ i + 1 }} · {{ s.label }} <span v-if="s.note" class="font-normal text-mail-ink-3">· {{ s.note }}</span>
          </p>
          <MailDraftCard :draft="s.draft" :reply-count="s.draft.state === 'sent' ? 0 : undefined" />
        </div>
      </div>
    </section>

    <section class="mt-10 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <MailSectionHeader title="In chat" />
        <MailDraftStack :drafts="sampleDrafts" conversation-id="conv-outreach" />
        <MailDraftCard :draft="bright" position="3 of 3" class="max-w-[362px]" />
        <MailReplyCard :reply="reply" variant="chat" context-label="Hoormij · Outreach" context-href="/mail" class="max-w-[362px]" />
      </div>
      <div class="flex flex-col gap-3">
        <MailSectionHeader title="Queue strip" />
        <MailQueueStrip :drafts="queueDrafts" />
        <MailQueueStrip :drafts="queueDrafts" detailed />
        <MailSectionHeader title="Reply" class="mt-4" />
        <MailReplyCard :reply="reply" context-label="Hoormij · Outreach" context-href="/mail" />
        <UButton label="Open batch review" icon="i-lucide-mail-check" color="neutral" class="mt-4 min-h-11 self-start px-5" @click="review.open({ conversationId: 'conv-outreach', subtitle: 'Priority 1 Dutch media · Outreach' })" />
      </div>
    </section>

    <section class="mt-10 max-w-xl">
      <MailSectionHeader title="Sender addresses" />
      <div class="mt-3 rounded-mail-card bg-mail-card p-4 shadow-mail-lift sm:p-5">
        <MailSendersEditor agent-id="agent-leo-speak" />
      </div>
    </section>

    <section class="mt-10 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <MailSectionHeader title="Panel" />
        <div class="flex h-[720px] flex-col rounded-mail-card bg-mail-card pt-2 shadow-mail-lift" style="--mail-surface: var(--color-mail-card)">
          <MailPanel conversation-id="conv-outreach" review-subtitle="Priority 1 Dutch media · Outreach" />
        </div>
      </div>
      <div class="flex flex-col gap-3">
        <MailSectionHeader title="Thread" />
        <UButton v-if="!thread" label="Show the Hoormij thread" color="neutral" variant="soft" class="min-h-10 self-start" @click="thread = true" />
        <MailThread v-else draft-id="draft-hoormij" :on-back="() => { thread = false }" />
      </div>
    </section>
  </div>
</template>
