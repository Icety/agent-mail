<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { MailDraft } from '../../shared/types'
import type { MailUiTone } from '../utils/mailTone'
import { mailContextParts, mailOutcomeLabel, mailRecipientName, mailWhen, mailWindowSeconds, mailSecondsLeft } from '../utils/mailView'

// One draft, in every state. The routing block (From, To, Cc) reads first and is never cut off,
// the body is shown in full, and nothing leaves without the Send button (it names the recipient
// when there is room; the To line always does).
// Generic: works in any chat, panel or review; it only needs the draft.
const props = withDefaults(defineProps<{
  draft: MailDraft
  /** card: own actions in the footer. review: header actions only (the review has its own bar). */
  variant?: 'card' | 'review'
  /** "2 of 3" in the corner. */
  position?: string
  /** Number of replies, for the sent footer ("No reply yet"). Unknown when left out. */
  replyCount?: number
  /** Called by "Open thread"; default opens it on the mail page. */
  onThread?: (draftId: string) => void
}>(), { variant: 'card', position: undefined, replyCount: undefined, onThread: undefined })

const d = useMailDraft(() => props.draft)
const actions = useMailActions()
const editor = useMailEditor()
const now = useMailNow()

const busy = ref<string | null>(null)
const revising = ref(false)
const expanded = ref(false)
// "Delivery unknown": it may have gone out. Sending again asks first.
const confirmResend = ref(false)

const recipient = computed(() => mailRecipientName(d.value))
const toName = computed(() => d.value.to.length === 1 ? mailContextParts(d.value.contextLabel).name : null)
const outcome = computed(() => mailOutcomeLabel(d.value, (props.replyCount ?? 0) > 0))
// Fields can change (From, Cc, Edit, Ask agent to revise). Not for "unknown": it may have gone out.
const editable = computed(() => ['draft', 'edited', 'failed'].includes(d.value.state))
// The agent wrote the latest version on top of an earlier one (agent revisions land in 'draft').
const agentRevised = computed(() => d.value.state === 'draft' && d.value.revision > 1)
const compact = computed(() => d.value.state === 'discarded' || (d.value.state === 'sent' && !expanded.value))
const simulated = computed(() => d.value.state === 'sent' && d.value.outcome === 'simulated')

const run = async (name: string, fn: () => Promise<unknown>) => {
  busy.value = name
  try {
    await fn()
  }
  finally {
    busy.value = null
  }
}
const send = () => run('send', () => actions.send(d.value))
const resend = () => run('send', async () => {
  if (await actions.send(d.value)) confirmResend.value = false
})
const markSent = () => run('mark', () => actions.markSent(d.value))
const discard = () => run('discard', () => actions.discard(d.value))
const restore = () => run('restore', () => actions.restore(d.value))
const undo = () => run('undo', () => actions.undo(d.value))
const stop = () => run('stop', () => actions.stopRevise(d.value))
const edit = async (): Promise<void> => { await editor.open(d.value) }
const revise = (note: string) => run('revise', async () => {
  if (await actions.revise(d.value, note)) revising.value = false
})
const openThread = async (): Promise<void> => { await (props.onThread ? props.onThread(d.value.id) : navigateTo({ path: '/mail', query: { thread: d.value.id } })) }

const overflow = computed<DropdownMenuItem[]>(() => [
  ...(props.variant === 'review' ? [{ label: 'Ask agent to revise', icon: 'i-lucide-wand-sparkles', onSelect: () => { revising.value = true } }] : []),
  { label: 'Discard draft', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { void discard() } },
])

// The state line at the top.
const head = computed(() => {
  const s = d.value
  const at = mailWhen(s.updatedAt, new Date(now.value))
  switch (s.state) {
    case 'edited': return { icon: 'i-lucide-pencil', tile: 'neutral' as MailUiTone, solid: true, label: 'Edited by you', meta: at, tone: 'text-mail-ink' }
    case 'revising': return { icon: 'i-lucide-wand-sparkles', tile: 'mail' as MailUiTone, label: `Revising${s.revisionNote ? `: ${s.revisionNote}` : ''}`, meta: at, tone: 'text-mail-ink' }
    case 'queued': return { icon: 'i-lucide-clock', tile: 'neutral' as MailUiTone, label: 'Queued, not sent yet', meta: `you tapped Send ${at}`, tone: 'text-mail-ink' }
    case 'sending': return { icon: 'i-lucide-loader-circle', tile: 'neutral' as MailUiTone, label: 'Sending now', meta: 'it can no longer be changed', tone: 'text-mail-ink' }
    case 'failed': return { icon: 'i-lucide-circle-alert', tile: 'error' as MailUiTone, label: 'Not sent', meta: at, tone: 'text-mail-err-deep' }
    case 'unknown': return { icon: 'i-lucide-circle-help', tile: 'warn' as MailUiTone, label: 'Delivery unknown', meta: at, tone: 'text-mail-warn-deep' }
    case 'sent': return simulated.value
      ? { icon: 'i-lucide-flask-conical', tile: 'neutral' as MailUiTone, label: 'Simulated', meta: mailWhen(s.sentAt, new Date(now.value)), tone: 'text-mail-ink' }
      : { icon: 'i-lucide-check', tile: 'ok' as MailUiTone, label: 'Sent', meta: mailWhen(s.sentAt, new Date(now.value)), tone: 'text-mail-ink' }
    default: return agentRevised.value
      ? { icon: 'i-lucide-wand-sparkles', tile: 'mail' as MailUiTone, label: 'Agent revised', meta: at, tone: 'text-mail-ink' }
      : { icon: 'i-lucide-mail', tile: 'mail' as MailUiTone, label: 'Draft', meta: `from agent ${at}`, tone: 'text-mail-ink' }
  }
})

const ring = computed(() => {
  if (d.value.state === 'failed') return 'ring-2 ring-mail-err-fill shadow-none'
  if (d.value.state === 'unknown') return 'ring-2 ring-mail-warn-fill shadow-none'
  return 'shadow-mail-lift'
})
// 36px on desktop, 44px touch targets on a phone.
const btn = 'min-h-9 max-sm:min-h-11 px-3.5'
</script>

<template>
  <!-- Discarded: one quiet line with Restore. -->
  <div v-if="d.state === 'discarded'" class="flex items-center gap-3 rounded-mail-card bg-mail-card py-2.5 ps-4 pe-2.5 shadow-mail-ring">
    <UIcon name="i-lucide-trash-2" class="size-4 shrink-0 text-mail-ink-3" />
    <div class="min-w-0 flex-1">
      <p class="text-sm text-mail-ink-2">
        Draft to {{ recipient }} discarded
      </p>
      <p class="truncate text-xs text-mail-ink-3">
        {{ d.subject }}
      </p>
    </div>
    <UButton label="Restore" icon="i-lucide-archive-restore" color="neutral" variant="soft" :class="btn" :loading="busy === 'restore'" @click="restore" />
  </div>

  <!-- Sent, folded: one line, tap to expand. -->
  <button
    v-else-if="compact"
    type="button"
    class="flex w-full items-center gap-3 rounded-mail-card bg-mail-card py-3 ps-3.5 pe-3 text-start shadow-mail-lift"
    :aria-expanded="false"
    @click="expanded = true"
  >
    <MailIconTile :icon="head.icon" :tone="head.tile" :solid="'solid' in head" size="sm" />
    <span class="min-w-0 flex-1">
      <span class="block text-sm text-mail-ink">
        <span class="font-semibold">{{ simulated ? 'Simulated send' : 'Sent' }} to {{ recipient }}</span>
        <span class="text-mail-ink-3"> · {{ head.meta }}</span>
      </span>
      <span class="block truncate text-xs text-mail-ink-3">{{ simulated ? outcome.label : d.subject }}</span>
    </span>
    <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-mail-ink-3" />
  </button>

  <!-- shrink-0: in a scrolling flex column, overflow-hidden would let the card shrink and clip the body. -->
  <article v-else class="@container shrink-0 overflow-hidden rounded-mail-card bg-mail-card" :class="ring" :aria-label="`${head.label}: ${d.subject}`">
    <!-- State line -->
    <header class="flex min-h-12 items-center gap-2 px-4 pt-3.5 pb-1">
      <MailIconTile :icon="head.icon" :tone="head.tile" :solid="'solid' in head" size="xs" :icon-class="d.state === 'sending' ? 'size-4 animate-spin' : undefined" />
      <p class="min-w-0 flex-1 text-sm leading-snug">
        <span v-if="d.state === 'revising'" class="me-1.5 inline-block size-2 animate-pulse rounded-full bg-mail-ok-fill align-middle" aria-hidden="true" />
        <span class="font-semibold" :class="head.tone">{{ head.label }}</span>
        <span v-if="head.meta" class="text-mail-ink-3"> · {{ head.meta }}</span>
      </p>
      <span v-if="props.position" class="shrink-0 text-xs text-mail-ink-3 tabular-nums">{{ props.position }}</span>
      <template v-if="props.variant === 'review' && editable">
        <UButton label="Edit" icon="i-lucide-pencil" color="neutral" variant="soft" :class="btn" @click="edit" />
        <UDropdownMenu :items="overflow" :content="{ align: 'end' }">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" class="size-9 justify-center max-sm:size-11" aria-label="More actions" />
        </UDropdownMenu>
      </template>
      <UButton v-if="d.state === 'sent'" icon="i-lucide-chevron-up" color="neutral" variant="ghost" class="size-9 justify-center max-sm:size-11" aria-label="Fold" @click="expanded = false" />
    </header>

    <div class="flex flex-col gap-3 px-4 pt-2 pb-4">
      <!-- What went wrong -->
      <div v-if="d.state === 'failed'" class="flex gap-2.5 rounded-mail-panel bg-mail-err-tint px-3.5 py-3 text-mail-err-deep">
        <UIcon name="i-lucide-mail-x" class="mt-0.5 size-4 shrink-0" />
        <div class="min-w-0 text-sm">
          <p class="font-semibold break-words">
            {{ d.error || 'The mail server did not accept it' }}
          </p>
          <p class="mt-0.5 text-xs opacity-85">
            Check the address, then retry.
          </p>
        </div>
      </div>
      <div v-else-if="d.state === 'unknown'" class="flex gap-2.5 rounded-mail-panel bg-mail-warn-tint px-3.5 py-3 text-mail-warn-deep">
        <UIcon name="i-lucide-circle-help" class="mt-0.5 size-4 shrink-0" />
        <div class="min-w-0 text-sm">
          <p class="font-semibold">
            Delivery unknown, check before resending
          </p>
          <p class="mt-0.5 text-xs opacity-85">
            The app restarted while this was being sent, so it may have gone out. Look in the Sent folder of {{ d.from }} first.
          </p>
        </div>
      </div>

      <!-- From, To, Cc: always in full -->
      <dl class="rounded-mail-panel bg-mail-inset px-3 text-sm dark:bg-mail-raised/70">
        <div class="flex items-center gap-3 py-1.5">
          <dt class="w-9 shrink-0 text-mail-ink-3">
            From
          </dt>
          <dd class="min-w-0 flex-1">
            <MailSenderPicker :draft="d" :editable="editable" />
          </dd>
        </div>
        <div class="flex items-start gap-3 border-t border-mail-line py-2.5">
          <dt class="w-9 shrink-0 text-mail-ink-3">
            To
          </dt>
          <dd class="min-w-0 flex-1">
            <span v-if="toName" class="me-1.5 font-semibold text-mail-ink">{{ toName }}</span>
            <template v-for="(address, i) in d.to" :key="address"><MailAddress :address="address" :class="d.state === 'failed' ? 'text-mail-err-deep underline decoration-wavy decoration-1 underline-offset-4' : 'text-mail-ink-2'" />{{ i < d.to.length - 1 ? ', ' : '' }}</template>
          </dd>
          <UButton
            v-if="editable && d.cc.length === 0 && props.variant !== 'review'"
            label="Cc"
            icon="i-lucide-plus"
            color="neutral"
            variant="link"
            size="xs"
            class="relative -my-1 shrink-0 text-mail-ink-3 max-sm:after:absolute max-sm:after:-inset-x-2 max-sm:after:-inset-y-3.5 max-sm:after:content-['']"
            aria-label="Add Cc"
            @click="edit"
          />
        </div>
        <div v-if="d.cc.length" class="flex items-start gap-3 border-t border-mail-line py-2.5">
          <dt class="w-9 shrink-0 text-mail-ink-3">
            Cc
          </dt>
          <dd class="min-w-0 flex-1 text-mail-ink-2">
            <template v-for="(address, i) in d.cc" :key="address"><MailAddress :address="address" />{{ i < d.cc.length - 1 ? ', ' : '' }}</template>
          </dd>
        </div>
      </dl>

      <!-- The mail itself, in full -->
      <div :class="d.state === 'revising' && 'opacity-60'">
        <h3 class="text-base leading-snug font-semibold text-pretty text-mail-ink">
          {{ d.subject }}
        </h3>
        <p class="mt-1.5 text-[15px] leading-relaxed whitespace-pre-wrap text-mail-ink [overflow-wrap:anywhere]">
          {{ d.body }}
        </p>
      </div>
      <div v-if="d.state === 'revising'" class="flex flex-col gap-2" aria-hidden="true">
        <span class="h-2 w-11/12 animate-pulse rounded-full bg-mail-ok-tint" />
        <span class="h-2 w-2/3 animate-pulse rounded-full bg-mail-ok-tint" />
      </div>

      <div v-if="d.contextLabel || $slots.chips" class="flex flex-wrap items-center gap-2">
        <MailContextChip v-if="d.contextLabel" :label="d.contextLabel" :href="d.contextHref" />
        <slot name="chips" :draft="d" />
      </div>

      <p v-if="simulated" class="flex items-center gap-2 rounded-mail-control bg-mail-inset px-3 py-2 text-xs text-mail-ink-2 dark:bg-mail-raised">
        <UIcon name="i-lucide-flask-conical" class="size-3.5 shrink-0" />
        Simulated (no mail server configured). Nothing left this app.
      </p>

      <!-- Ask the agent to revise -->
      <div v-if="revising" class="rounded-mail-panel bg-mail-ok-tint p-3.5">
        <MailReviseInput :loading="busy === 'revise'" @submit="revise" @cancel="revising = false" />
      </div>

      <!-- Queued: countdown and Undo -->
      <template v-if="d.state === 'queued'">
        <div class="flex items-center gap-3 rounded-mail-panel bg-mail-action py-2 ps-2.5 pe-2 text-mail-on-action">
          <MailCountdown :send-at="d.sendAt" :total="mailWindowSeconds(d)" />
          <div class="min-w-0 flex-1 leading-tight">
            <p class="text-sm font-semibold">
              {{ mailSecondsLeft(d.sendAt, now) > 0 ? `Sends in ${mailSecondsLeft(d.sendAt, now)} s` : 'Sending now' }}
            </p>
            <p class="text-xs opacity-75 [overflow-wrap:anywhere]">
              to {{ d.to.join(', ') }}
            </p>
          </div>
          <UButton
            v-if="mailSecondsLeft(d.sendAt, now) > 0"
            label="Undo"
            icon="i-lucide-undo-2"
            color="neutral"
            variant="outline"
            class="min-h-10 bg-mail-card px-4 text-mail-ink ring-0 hover:bg-mail-card/90 max-sm:min-h-11"
            :loading="busy === 'undo'"
            @click="undo"
          />
        </div>
        <div class="flex items-center gap-2">
          <p class="flex min-w-0 flex-1 items-start gap-1.5 text-xs text-mail-ink-3">
            <UIcon name="i-lucide-info" class="mt-px size-3.5 shrink-0" />
            Nothing is sent before the countdown ends. Editing cancels the send and puts it back in Drafts.
          </p>
          <UButton v-if="props.variant === 'card' && mailSecondsLeft(d.sendAt, now) > 0" label="Edit" icon="i-lucide-pencil" color="neutral" variant="soft" class="min-h-9 max-sm:min-h-11 shrink-0 px-3" @click="edit" />
        </div>
      </template>
    </div>

    <!-- Actions -->
    <footer v-if="props.variant === 'card' && (editable || d.state === 'revising')" class="flex items-center justify-end gap-1.5 border-t border-mail-line px-3 py-2.5">
      <template v-if="d.state === 'revising'">
        <UButton label="Stop" icon="i-lucide-square" color="neutral" variant="soft" :class="btn" :loading="busy === 'stop'" @click="stop" />
        <span class="me-auto ms-1 min-w-0 text-xs text-mail-ink-3">Old text, being rewritten</span>
        <UButton icon="i-lucide-send" color="neutral" :class="btn" disabled :aria-label="`Send to ${recipient}`">
          <span class="@md:hidden">Send</span><span class="hidden @md:inline">Send to {{ recipient }}</span>
        </UButton>
      </template>
      <template v-else>
        <UButton label="Discard" color="neutral" variant="ghost" class="me-auto hidden @md:inline-flex" :class="btn" :loading="busy === 'discard'" @click="discard" />
        <UDropdownMenu :items="overflow" :content="{ align: 'start' }">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" class="me-auto size-9 justify-center max-sm:size-11 @md:hidden" aria-label="More actions" />
        </UDropdownMenu>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-wand-sparkles"
          class="min-h-9 px-2.5 max-sm:min-h-11 @sm:px-3.5"
          aria-label="Ask agent to revise"
          @click="revising = !revising"
        >
          <span class="hidden @sm:inline @lg:hidden">Revise</span>
          <span class="hidden @lg:inline">Ask agent to revise</span>
        </UButton>
        <UButton label="Edit" color="neutral" variant="soft" class="min-h-9 px-3 max-sm:min-h-11" @click="edit" />
        <UButton
          v-if="d.state === 'failed'"
          label="Retry"
          icon="i-lucide-rotate-ccw"
          color="neutral"
          :class="btn"
          :aria-label="`Retry sending to ${recipient}`"
          :loading="busy === 'send'"
          @click="send"
        />
        <UButton v-else icon="i-lucide-send" color="neutral" class="whitespace-nowrap" :class="btn" :aria-label="`Send to ${recipient}`" :loading="busy === 'send'" @click="send">
          <span class="@md:hidden">Send</span><span class="hidden @md:inline">Send to {{ recipient }}</span>
        </UButton>
      </template>
    </footer>

    <!-- Delivery unknown: it may have gone out -->
    <footer v-else-if="props.variant === 'card' && d.state === 'unknown'" class="border-t border-mail-line px-3 py-2.5">
      <div v-if="confirmResend" class="flex flex-wrap items-center justify-end gap-2" role="alert">
        <p class="me-auto min-w-0 basis-48 ps-1 text-sm font-medium text-mail-ink">
          Check the recipient's inbox first. Send again?
        </p>
        <UButton label="Cancel" color="neutral" variant="ghost" :class="btn" @click="confirmResend = false" />
        <UButton icon="i-lucide-send" color="neutral" class="whitespace-nowrap" :class="btn" :aria-label="`Send again to ${recipient}`" :loading="busy === 'send'" @click="resend">
          Send again
        </UButton>
      </div>
      <div v-else class="flex items-center justify-end gap-1.5">
        <UButton label="Discard" color="neutral" variant="ghost" class="me-auto hidden @md:inline-flex" :class="btn" :loading="busy === 'discard'" @click="discard" />
        <UDropdownMenu :items="overflow" :content="{ align: 'start' }">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" class="me-auto size-9 justify-center max-sm:size-11 @md:hidden" aria-label="More actions" />
        </UDropdownMenu>
        <UButton label="Mark as sent" icon="i-lucide-check-check" color="neutral" variant="soft" class="whitespace-nowrap" :class="btn" :loading="busy === 'mark'" @click="markSent" />
        <UButton label="Send again" icon="i-lucide-send" color="neutral" variant="outline" class="whitespace-nowrap" :class="btn" :aria-label="`Send again to ${recipient}`" @click="confirmResend = true" />
      </div>
    </footer>
    <footer v-else-if="d.state === 'sent'" class="flex items-center gap-2 border-t border-mail-line px-4 py-2.5">
      <p class="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-mail-ink-3">
        <template v-if="props.replyCount !== undefined">
          <UIcon :name="props.replyCount ? 'i-lucide-reply' : 'i-lucide-clock'" class="size-3.5" />
          {{ props.replyCount ? `${props.replyCount} ${props.replyCount === 1 ? 'reply' : 'replies'}` : 'No reply yet' }}
        </template>
      </p>
      <UButton label="Open thread" color="neutral" variant="soft" :class="btn" @click="openThread" />
    </footer>
  </article>
</template>
