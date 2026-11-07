<script setup lang="ts">
import type { MailDraft } from '../../shared/types'
import { isMailReviewable, mailRecipientName } from '../utils/mailView'

// In a chat, above a run of drafts the agent wrote in one go: how many, from whom, Review all.
const props = defineProps<{
  drafts: MailDraft[]
  conversationId: string
}>()

const review = useMailReview()
const current = computed(() => props.drafts.map(d => currentMailDraft(d)))
const waiting = computed(() => current.value.filter(isMailReviewable))
const froms = computed(() => [...new Set(current.value.map(d => d.from))])
</script>

<template>
  <div class="flex items-center gap-3 rounded-mail-card bg-mail-inset p-3 ps-3.5 dark:bg-mail-raised">
    <MailIconTile icon="i-lucide-layers" class="bg-mail-card text-mail-ink-2 shadow-mail-ring" />
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold text-mail-ink">
        {{ props.drafts.length }} drafts<template v-if="waiting.length">
          · {{ waiting.length }} to review
        </template>
      </p>
      <p class="truncate text-xs text-mail-ink-3">
        {{ current.map(d => mailRecipientName(d)).join(', ') }}
      </p>
      <p class="text-xs break-words text-mail-ink-3">
        From {{ froms.join(', ') }}
      </p>
    </div>
    <UButton
      v-if="waiting.length"
      :label="waiting.length === 1 ? 'Review' : 'Review all'"
      color="neutral"
      variant="outline"
      class="min-h-10 shrink-0 bg-mail-card px-4 max-sm:min-h-11"
      @click="review.open({ conversationId: props.conversationId, draftIds: waiting.map(d => d.id) })"
    />
  </div>
</template>
