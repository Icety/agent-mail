<script setup lang="ts">
import type { MailDraft } from '../../shared/types'
import { mailBatchStatus, mailBatchSummary, mailNextPending, mailRecipientName, mailWhen, type MailBatchDecision, type MailBatchStatus } from '../utils/mailView'

// Review a stack of drafts one by one: fullscreen on a phone, a modal on desktop. Send queues the
// draft (10 s undo in the queue strip) and moves on; Skip leaves it in Drafts. Opened with
// useMailReview().open({ conversationId | agentId | draftIds }); the overlay passes `open`.
const props = withDefaults(defineProps<{
  conversationId?: string | null
  agentId?: string | null
  draftIds?: string[]
  startId?: string
  subtitle?: string
}>(), { conversationId: null, agentId: null, draftIds: undefined, startId: undefined, subtitle: undefined })

const emit = defineEmits<{ 'close': [], 'after:leave': [] }>()

const { isPhone: phone } = useMailViewport()
const actions = useMailActions()
const mail = useMail(() => ({ conversationId: props.conversationId, agentId: props.agentId }))

const ids = ref<string[]>(props.draftIds ? [...props.draftIds] : [])
watch(mail.state, (state) => {
  if (state === 'ready' && ids.value.length === 0 && !props.draftIds) ids.value = mail.reviewable.value.map(d => d.id)
}, { immediate: true })

const decisions = ref<Record<string, MailBatchDecision>>({})
const drafts = computed(() => ids.value.map(id => mailCachedDraft(id)))
const statuses = computed<MailBatchStatus[]>(() => ids.value.map((id, i) => mailBatchStatus(drafts.value[i], decisions.value[id] ?? null)))
const index = ref(Math.max(0, props.startId ? ids.value.indexOf(props.startId) : 0))
const current = computed<MailDraft | undefined>(() => drafts.value[index.value])
const currentStatus = computed(() => statuses.value[index.value])
const finished = computed(() => ids.value.length > 0 && !statuses.value.includes('pending'))
const summary = computed(() => mailBatchSummary(statuses.value))
const batchDrafts = computed(() => drafts.value.filter((d): d is MailDraft => Boolean(d)))

// Something came back to pending (Undo, a revision is in): go there.
watch(finished, (now, before) => {
  if (before && !now) index.value = statuses.value.indexOf('pending')
})

const busy = ref<'send' | 'revise' | null>(null)
const revising = ref(false)

const advance = () => {
  revising.value = false
  const next = mailNextPending(statuses.value, index.value)
  if (next !== null) index.value = next
}
const go = (i: number) => {
  if (i < 0 || i >= ids.value.length) return
  revising.value = false
  index.value = i
}

const canAct = computed(() => currentStatus.value === 'pending' && !busy.value)
const send = async () => {
  const d = current.value
  if (!d || !canAct.value) return
  busy.value = 'send'
  // The queue strip below shows it with Undo; no toast over the action bar.
  const next = await actions.send(d, { toast: false })
  busy.value = null
  if (!next) return
  decisions.value = { ...decisions.value, [d.id]: 'sent' }
  advance()
}
const skip = () => {
  const d = current.value
  if (!d || !canAct.value) return
  decisions.value = { ...decisions.value, [d.id]: 'skipped' }
  advance()
}
const revise = async (note: string) => {
  const d = current.value
  if (!d) return
  busy.value = 'revise'
  const next = await actions.revise(d, note)
  busy.value = null
  if (next) advance()
}
const reviewAgain = (i: number) => {
  const id = ids.value[i]
  if (!id) return
  const { [id]: _dropped, ...rest } = decisions.value
  decisions.value = rest
  go(i)
}

defineShortcuts({
  arrowleft: () => go(index.value - 1),
  arrowright: () => go(index.value + 1),
  s: skip,
  r: () => { if (canAct.value) revising.value = true },
  meta_enter: send,
  u: () => {
    const queued = batchDrafts.value.filter(d => d.state === 'queued').sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]
    if (queued) void actions.undo(queued)
  },
})

const segment = (status: MailBatchStatus, i: number) => {
  if (status === 'sent') return 'bg-mail-ok-fill'
  if (status === 'simulated') return 'bg-mail-ink-4'
  if (status === 'queued') return 'mail-stripes text-mail-ink h-1.5'
  if (i === index.value && !finished.value) return 'bg-mail-ink'
  if (status === 'skipped' || status === 'discarded') return 'mail-stripes text-mail-ink-4 h-1.5'
  return 'bg-mail-line-strong'
}
const SEGMENT_ICON: Partial<Record<MailBatchStatus, string>> = {
  sent: 'i-lucide-check',
  simulated: 'i-lucide-flask-conical',
  queued: 'i-lucide-clock',
  skipped: 'i-lucide-skip-forward',
  revising: 'i-lucide-wand-sparkles',
  failed: 'i-lucide-circle-alert',
  unknown: 'i-lucide-circle-help',
  discarded: 'i-lucide-trash-2',
}
const recipient = computed(() => current.value ? mailRecipientName(current.value) : '')
const title = computed(() => props.subtitle ?? (ids.value.length === 1 ? '1 draft' : `${ids.value.length} drafts`))
</script>

<template>
  <UModal
    :fullscreen="phone"
    :close="false"
    title="Review drafts"
    :description="title"
    :ui="{ content: phone ? 'bg-mail-ground' : 'max-w-[700px] rounded-mail-sheet bg-mail-card overflow-hidden' }"
    @update:open="v => !v && emit('close')"
    @after:leave="emit('after:leave')"
  >
    <template #content>
      <div class="flex h-full min-h-0 flex-col" :class="!phone && 'max-h-[min(860px,92dvh)]'">
        <!-- Header and progress -->
        <header class="shrink-0 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6">
          <div class="flex items-center gap-3">
            <UButton v-if="phone" icon="i-lucide-x" color="neutral" variant="ghost" class="size-11 justify-center" aria-label="Close review" @click="emit('close')" />
            <MailIconTile v-else icon="i-lucide-mails" tone="mail" ring />
            <div class="min-w-0 flex-1">
              <h2 class="text-lg leading-tight font-semibold text-mail-ink">
                Review drafts
              </h2>
              <p class="truncate text-xs text-mail-ink-3">
                {{ title }}
              </p>
            </div>
            <span v-if="ids.length" class="rounded-mail-badge bg-mail-inset px-2.5 py-1 text-sm font-semibold text-mail-ink tabular-nums dark:bg-mail-raised">{{ finished ? 'Done' : `${Math.min(index + 1, ids.length)} of ${ids.length}` }}</span>
            <UButton v-if="!phone" icon="i-lucide-x" color="neutral" variant="outline" class="size-10 justify-center rounded-full" aria-label="Close review" @click="emit('close')" />
          </div>
          <ol v-if="ids.length > 1" class="mt-3 flex gap-1.5" aria-label="Progress">
            <li v-for="(status, i) in statuses" :key="ids[i]" class="min-w-0 flex-1">
              <button type="button" class="flex min-h-11 w-full flex-col justify-center gap-1 text-start" :aria-current="i === index ? 'step' : undefined" @click="go(i)">
                <span class="block h-1 w-full rounded-full" :class="segment(status, i)" />
                <span class="flex min-w-0 items-center gap-1 text-xs" :class="i === index ? 'font-semibold text-mail-ink' : status === 'sent' ? 'text-mail-ok-deep' : 'text-mail-ink-3'">
                  <UIcon v-if="SEGMENT_ICON[status]" :name="SEGMENT_ICON[status]!" class="size-3 shrink-0" />
                  <span class="truncate">{{ drafts[i] ? mailRecipientName(drafts[i]!) : 'Removed' }}</span>
                </span>
              </button>
            </li>
          </ol>
        </header>

        <!-- Loading or nothing to review -->
        <div v-if="mail.state.value === 'loading' && ids.length === 0" class="flex flex-1 flex-col gap-3 p-4 sm:p-6">
          <USkeleton class="h-64 w-full rounded-mail-card" />
        </div>
        <div v-else-if="ids.length === 0" class="flex-1 p-4">
          <MailEmptyState icon="i-lucide-mail-check" title="Nothing to review" body="No drafts are waiting. New drafts from the agent show up in the chat and in Drafts." />
        </div>

        <!-- Done -->
        <div v-else-if="finished" class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pt-6 pb-4 sm:px-6">
          <MailIconTile icon="i-lucide-mail-check" tone="ok" size="3xl" />
          <div>
            <p class="font-mail-display text-3xl leading-tight font-bold text-pretty text-mail-ink sm:text-4xl" aria-live="polite">
              {{ summary }}.
            </p>
            <p v-if="statuses.includes('skipped')" class="mt-2 text-mail-ink-2">
              Skipped drafts stay in Drafts.
            </p>
          </div>
          <ul class="rounded-mail-card bg-mail-card px-4 shadow-mail-lift">
            <li v-for="(status, i) in statuses" :key="ids[i]" class="flex items-center gap-3 border-b border-mail-line py-3 last:border-b-0">
              <MailCountdown v-if="status === 'queued' && drafts[i]?.state === 'queued'" :send-at="drafts[i]!.sendAt" size="sm" class="text-mail-ink" />
              <MailIconTile v-else :icon="SEGMENT_ICON[status] ?? 'i-lucide-mail'" :tone="status === 'sent' ? 'ok' : 'neutral'" size="sm" />
              <span class="min-w-0 flex-1">
                <span class="block font-semibold text-mail-ink">{{ drafts[i] ? mailRecipientName(drafts[i]!) : 'Removed draft' }}</span>
                <span class="block truncate text-xs text-mail-ink-3">{{ drafts[i]?.subject }}</span>
              </span>
              <span v-if="status === 'sent' || status === 'simulated'" class="flex shrink-0 items-center gap-1 text-sm font-semibold" :class="status === 'simulated' ? 'text-mail-ink-2' : 'text-mail-ok-deep'">
                <UIcon :name="SEGMENT_ICON[status]!" class="size-4" />
                {{ status === 'simulated' ? 'Simulated' : 'Sent' }} {{ mailWhen(drafts[i]?.sentAt ?? null) }}
              </span>
              <span v-else-if="status === 'queued'" class="flex shrink-0 items-center gap-1 text-sm font-semibold text-mail-ink">
                <UIcon name="i-lucide-clock" class="size-4" />Queued
              </span>
              <UButton v-else-if="status === 'skipped'" label="Review" color="neutral" variant="soft" class="min-h-11 shrink-0 px-4 sm:min-h-9 sm:px-3.5" @click="reviewAgain(i)" />
              <span v-else class="shrink-0 text-sm text-mail-ink-3">{{ status === 'failed' ? 'Not sent' : status === 'revising' ? 'Being revised' : status === 'unknown' ? 'Delivery unknown' : 'Discarded' }}</span>
            </li>
          </ul>
          <p v-if="statuses.includes('simulated')" class="flex items-center gap-1.5 text-xs text-mail-ink-3">
            <UIcon name="i-lucide-flask-conical" class="size-3.5" />
            Simulated (no mail server configured). Nothing left this app.
          </p>
        </div>

        <!-- One draft -->
        <div v-else class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pt-3 pb-3 sm:px-6">
          <MailDraftCard v-if="current" :key="current.id" :draft="current" variant="review" />
          <div v-if="revising && !phone" class="rounded-mail-panel bg-mail-ok-tint p-3.5">
            <MailReviseInput :loading="busy === 'revise'" @submit="revise" @cancel="revising = false" />
          </div>
        </div>

        <!-- Queue and actions -->
        <footer v-if="ids.length" class="flex shrink-0 flex-col gap-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
          <MailQueueStrip :drafts="batchDrafts" :detailed="!phone" :undo-hint="!phone" />
          <div v-if="finished" class="flex gap-2">
            <UButton label="Done" color="neutral" size="xl" block class="min-h-13 justify-center" @click="emit('close')" />
          </div>
          <div v-else class="flex items-center gap-2">
            <template v-if="!phone">
              <UButton icon="i-lucide-chevron-left" color="neutral" variant="outline" class="size-10 justify-center rounded-full" aria-label="Previous draft" :disabled="index === 0" @click="go(index - 1)" />
              <UButton icon="i-lucide-chevron-right" color="neutral" variant="outline" class="me-auto size-10 justify-center rounded-full" aria-label="Next draft" :disabled="index >= ids.length - 1" @click="go(index + 1)" />
            </template>
            <UButton color="neutral" variant="soft" class="min-h-13 px-4" :disabled="!canAct" @click="skip">
              Skip <UKbd v-if="!phone" value="S" class="ms-1" />
            </UButton>
            <UButton color="neutral" variant="outline" icon="i-lucide-wand-sparkles" class="min-h-13 bg-mail-card px-4" :disabled="!canAct" @click="revising = true">
              Revise <UKbd v-if="!phone" value="R" class="ms-1" />
            </UButton>
            <UButton
              color="neutral"
              icon="i-lucide-send"
              class="min-h-13 min-w-0 flex-1 justify-center px-4 whitespace-nowrap sm:flex-none"
              :loading="busy === 'send'"
              :disabled="!canAct"
              :aria-label="`Send to ${recipient}`"
              @click="send"
            >
              <span class="truncate">Send to {{ recipient }}</span>
              <span v-if="!phone" class="ms-1 flex gap-0.5"><UKbd value="meta" /><UKbd value="enter" /></span>
            </UButton>
          </div>
          <p v-if="!phone && !finished" class="flex flex-wrap items-center gap-1.5 text-xs text-mail-ink-3">
            <UKbd value="arrowleft" /><UKbd value="arrowright" /> previous and next
            <UKbd value="U" class="ms-2" /> undo the latest send
            <UKbd value="escape" class="ms-2" /> close, queued sends keep their Undo
          </p>
        </footer>
      </div>

      <!-- Revise on the phone: a sheet over the draft -->
      <UDrawer
        v-if="phone"
        v-model:open="revising"
        title="Ask agent to revise"
        :description="current ? `Draft to ${recipient} · ${current.to.join(', ')}` : undefined"
        :ui="{ content: 'rounded-t-mail-sheet bg-mail-card', title: 'text-lg font-semibold', description: 'text-xs text-mail-ink-3 break-all', body: 'pb-[max(1rem,env(safe-area-inset-bottom))]' }"
      >
        <template #body>
          <MailReviseInput block :loading="busy === 'revise'" @submit="revise" @cancel="revising = false" />
        </template>
      </UDrawer>
    </template>
  </UModal>
</template>
