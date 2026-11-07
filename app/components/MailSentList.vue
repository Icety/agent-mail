<script setup lang="ts">
import type { MailDraft, MailReply } from '../../shared/types'
import { mailOutcomeLabel, mailRecipientName, mailSentGroups, mailWhen } from '../utils/mailView'

// The Sent tab of the mail panel: a count line, sent mail per day with its outcome, and a note
// when some sends were only simulated.
const props = defineProps<{ sent: MailDraft[], replies: MailReply[], selected?: string | null }>()
const emit = defineEmits<{ open: [draftId: string] }>()

const repliesByDraft = computed(() => new Set(props.replies.map(r => r.draftId)))
const groups = computed(() => mailSentGroups(props.sent, props.replies, iso => formatMailTime(iso, 'day')))
const simulatedCount = computed(() => props.sent.filter(d => d.outcome === 'simulated').length)
const repliedCount = computed(() => props.sent.filter(d => repliesByDraft.value.has(d.id)).length)
</script>

<template>
  <template v-if="props.sent.length">
    <p class="text-xs text-mail-ink-3">
      {{ props.sent.length }} sent<template v-if="simulatedCount">
        ({{ simulatedCount }} simulated)
      </template> · {{ repliedCount }} replied · {{ props.sent.length - repliedCount }} waiting for a reply
    </p>
    <section v-for="group in groups" :key="group.key" class="flex flex-col gap-1.5">
      <h3 class="text-sm font-semibold text-mail-ink-2">
        {{ group.label }} <span class="font-normal text-mail-ink-3">{{ group.drafts.length }}</span>
      </h3>
      <ul class="rounded-mail-card bg-mail-card px-4 shadow-mail-lift">
        <li v-for="d in group.drafts" :key="d.id" class="border-b border-mail-line last:border-b-0">
          <button type="button" class="flex items-start gap-3 rounded-mail-panel py-3 text-start" :class="d.id === props.selected ? '-mx-2 w-[calc(100%+1rem)] bg-mail-inset px-2 dark:bg-mail-raised' : 'w-full'" :aria-current="d.id === props.selected ? 'true' : undefined" @click="emit('open', d.id)">
            <span class="min-w-0 flex-1">
              <span class="block truncate font-semibold text-mail-ink">{{ mailRecipientName(d) }}</span>
              <span class="block truncate text-sm text-mail-ink-2">{{ d.subject }}</span>
            </span>
            <span class="flex shrink-0 flex-col items-end gap-1">
              <span class="text-xs text-mail-ink-3 tabular-nums">{{ mailWhen(d.sentAt) }}</span>
              <MailStatusPill
                :label="mailOutcomeLabel(d, repliesByDraft.has(d.id)).short"
                :tone="mailOutcomeLabel(d, repliesByDraft.has(d.id)).tone"
                :title="mailOutcomeLabel(d, repliesByDraft.has(d.id)).label"
              />
            </span>
          </button>
        </li>
      </ul>
    </section>
    <p v-if="simulatedCount" class="flex items-center gap-1.5 text-xs text-mail-ink-3">
      <UIcon name="i-lucide-flask-conical" class="size-3.5" />
      Simulated (no mail server configured). Those never left this app.
    </p>
  </template>
  <MailEmptyState v-else icon="i-lucide-send" title="Nothing sent yet" body="Mail you send shows up here, with any replies." />
</template>
