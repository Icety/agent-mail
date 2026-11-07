<script setup lang="ts">
import type { MailDraft, MailReply } from '../../shared/types'
import { mailRecipientName, mailWhen } from '../utils/mailView'

// The Drafts tab of the mail panel: the queue strip, every draft as a row (opens it), a teaser for
// new replies, and the discarded drafts folded away. Slot: empty-action under "No drafts".
const props = defineProps<{ drafts: MailDraft[], queued: MailDraft[], discarded: MailDraft[], unread: MailReply[], selected?: string | null }>()
const emit = defineEmits<{ open: [draftId: string], replies: [] }>()

const STATE_PILL: Partial<Record<MailDraft['state'], { label: string, tone: 'neutral' | 'error' | 'warn' | 'ok' }>> = {
  edited: { label: 'Edited', tone: 'neutral' },
  revising: { label: 'Revising', tone: 'ok' },
  queued: { label: 'Queued', tone: 'neutral' },
  sending: { label: 'Sending', tone: 'neutral' },
  failed: { label: 'Not sent', tone: 'error' },
  unknown: { label: 'Delivery unknown', tone: 'warn' },
}
const showDiscarded = ref(false)
</script>

<template>
  <MailQueueStrip :drafts="props.queued" />
  <ul v-if="props.drafts.length" class="flex flex-col">
    <li v-for="d in props.drafts" :key="d.id" class="border-b border-mail-line last:border-b-0">
      <button type="button" class="flex items-start gap-3 rounded-mail-panel py-3 text-start" :class="d.id === props.selected ? '-mx-2 w-[calc(100%+1rem)] bg-mail-inset px-2 dark:bg-mail-raised' : 'w-full'" :aria-current="d.id === props.selected ? 'true' : undefined" @click="emit('open', d.id)">
        <MailIconTile icon="i-lucide-crosshair" tone="neutral" size="md" icon-class="size-4" />
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-2">
            <span class="truncate font-semibold text-mail-ink">{{ mailRecipientName(d) }}</span>
            <MailStatusPill v-if="STATE_PILL[d.state]" :label="STATE_PILL[d.state]!.label" :tone="STATE_PILL[d.state]!.tone" />
            <span class="ms-auto shrink-0 text-xs text-mail-ink-3 tabular-nums">{{ mailWhen(d.updatedAt) }}</span>
          </span>
          <span class="block text-xs break-all text-mail-ink-3">To {{ d.to.join(', ') }}</span>
          <span class="mt-1 block truncate text-sm font-medium text-mail-ink">{{ d.subject }}</span>
          <span class="line-clamp-2 text-sm text-mail-ink-2">{{ d.body.replace(/\s+/g, ' ') }}</span>
        </span>
        <UIcon name="i-lucide-chevron-right" class="mt-2.5 size-4 shrink-0 text-mail-ink-4" />
      </button>
    </li>
  </ul>
  <MailEmptyState
    v-else
    icon="i-lucide-mails"
    title="No drafts"
    body="Drafts the agent writes show up here. Nothing is sent until you tap Send."
  >
    <template v-if="$slots['empty-action']" #action>
      <slot name="empty-action" />
    </template>
  </MailEmptyState>

  <button
    v-if="props.unread[0]"
    type="button"
    class="flex items-center gap-3 rounded-mail-panel bg-mail-inset p-3 text-start dark:bg-mail-raised"
    @click="emit('replies')"
  >
    <MailIconTile icon="i-lucide-reply" tone="warn" size="md" icon-class="size-4" />
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm font-semibold text-mail-ink">{{ props.unread.length }} {{ props.unread.length === 1 ? 'reply' : 'replies' }} · {{ props.unread[0].fromName }}</span>
      <span class="block truncate text-xs text-mail-ink-3">{{ mailWhen(props.unread[0].receivedAt) }}{{ props.unread[0].agentNote ? ` · ${props.unread[0].agentNote}` : '' }}</span>
    </span>
    <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-mail-ink-4" />
  </button>

  <div v-if="props.discarded.length" class="flex flex-col gap-2">
    <UButton
      :label="`Discarded · ${props.discarded.length}`"
      :icon="showDiscarded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
      color="neutral"
      variant="ghost"
      size="sm"
      class="min-h-9 self-start text-mail-ink-3 max-sm:min-h-11"
      @click="showDiscarded = !showDiscarded"
    />
    <template v-if="showDiscarded">
      <MailDraftCard v-for="d in props.discarded" :key="d.id" :draft="d" />
    </template>
  </div>
</template>
