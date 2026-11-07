<script setup lang="ts">
import type { MailReply } from '../../shared/types'

// The Replies tab of the mail panel: new replies first, then earlier ones, each with the context
// of the draft it answers.
const props = defineProps<{ replies: MailReply[], sentCount: number }>()
const emit = defineEmits<{ open: [draftId: string], sent: [] }>()

const newReplies = computed(() => props.replies.filter(r => !r.readAt))
const oldReplies = computed(() => props.replies.filter(r => r.readAt))
const contextOf = (draftId: string) => mailCachedDraft(draftId)
</script>

<template>
  <template v-if="props.replies.length">
    <h3 v-if="newReplies.length" class="flex items-center gap-1.5 text-sm font-semibold text-mail-ink-2">
      <span class="size-1.5 rounded-full bg-mail-warn-deep" />New
    </h3>
    <MailReplyCard
      v-for="r in newReplies"
      :key="r.id"
      :reply="r"
      :context-label="contextOf(r.draftId)?.contextLabel"
      :context-href="contextOf(r.draftId)?.contextHref"
      :on-read="id => emit('open', id)"
    />
    <h3 v-if="oldReplies.length" class="text-sm font-semibold text-mail-ink-3">
      Earlier
    </h3>
    <MailReplyCard
      v-for="r in oldReplies"
      :key="r.id"
      :reply="r"
      :context-label="contextOf(r.draftId)?.contextLabel"
      :context-href="contextOf(r.draftId)?.contextHref"
      :on-read="id => emit('open', id)"
    />
  </template>
  <MailEmptyState
    v-else
    icon="i-lucide-inbox"
    title="No replies yet"
    :body="`Replies to your ${props.sentCount} sent ${props.sentCount === 1 ? 'email' : 'emails'} land here. With notifications on, you also get a push.`"
  >
    <template v-if="props.sentCount" #action>
      <UButton :label="`See ${props.sentCount} sent`" color="neutral" variant="outline" class="min-h-10 px-5 max-sm:min-h-11" @click="emit('sent')" />
    </template>
  </MailEmptyState>
</template>
