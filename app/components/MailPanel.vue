<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import type { MailOpenTarget } from '../../shared/types'

// Drafts, sent mail and replies of one conversation, one agent, or everything. Works in a chat
// pane, a sheet or a page. Opening a draft or a thread happens inside the panel.
// Slots: footer ({ count, review }) replaces the "Review all" bar (pass an empty one to hide it);
// empty-action under "No drafts". With onOpen the host shows opened mail itself and the panel
// stays on the lists, marking `selected`.
const props = withDefaults(defineProps<{
  conversationId?: string | null
  agentId?: string | null
  /** Open this thread (sent draft id) right away. */
  thread?: string | null
  /** Header line of the batch review. */
  reviewSubtitle?: string
  onOpen?: (target: MailOpenTarget) => void
  /** Draft id the host has open, marked in the lists. */
  selected?: string | null
}>(), { conversationId: null, agentId: null, thread: null, reviewSubtitle: undefined, onOpen: undefined, selected: null })

type Tab = 'drafts' | 'sent' | 'replies'
type View = { kind: 'list' } | { kind: 'draft', id: string } | { kind: 'thread', id: string }

const scope = computed(() => ({ conversationId: props.conversationId, agentId: props.agentId }))
const mail = useMail(scope)
const review = useMailReview()

const tab = ref<Tab>('drafts')
const view = ref<View>(props.thread ? { kind: 'thread', id: props.thread } : { kind: 'list' })
watch(() => props.thread, (id) => { if (id) view.value = { kind: 'thread', id } })
// Pages hide their own back button while a draft or thread is open, so there is one back control.
const emit = defineEmits<{ view: [kind: View['kind']] }>()
watch(() => view.value.kind, kind => emit('view', kind), { immediate: true })

const repliesByDraft = computed(() => {
  const map = new Map<string, number>()
  for (const r of mail.replies.value) map.set(r.draftId, (map.get(r.draftId) ?? 0) + 1)
  return map
})

const items = computed<TabsItem[]>(() => [
  // The same number as "Review all": drafts waiting for the owner, not queued or revising ones.
  { label: 'Drafts', value: 'drafts', badge: mail.reviewable.value.length ? { label: String(mail.reviewable.value.length), color: 'neutral', variant: 'solid' } : undefined },
  { label: 'Sent', value: 'sent', badge: mail.sent.value.length ? { label: String(mail.sent.value.length), color: 'neutral', variant: 'soft' } : undefined },
  { label: 'Replies', value: 'replies', badge: mail.unread.value.length ? { label: String(mail.unread.value.length), color: 'warning', variant: 'soft' } : undefined },
])

const openReview = () => review.open({
  conversationId: props.conversationId,
  agentId: props.agentId,
  draftIds: mail.reviewable.value.map(d => d.id),
  subtitle: props.reviewSubtitle,
})
const open = (target: MailOpenTarget) => {
  if (props.onOpen) return props.onOpen(target)
  view.value = target
}
const openThread = (id: string) => open({ kind: 'thread', id })
const back = () => { view.value = { kind: 'list' } }

defineExpose({ openThread, openReview })
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col px-4 sm:px-5">
    <!-- A draft or a thread, opened from the lists -->
    <div v-if="view.kind !== 'list'" class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-3">
      <template v-if="view.kind === 'draft'">
        <UButton label="All drafts" icon="i-lucide-chevron-left" color="neutral" variant="ghost" class="mb-2 min-h-10 self-start max-sm:min-h-11" @click="back" />
        <MailDraftCard
          v-if="mailCachedDraft(view.id)"
          :draft="mailCachedDraft(view.id)!"
          :reply-count="repliesByDraft.get(view.id) ?? 0"
          :on-thread="openThread"
        />
      </template>
      <MailThread v-else :draft-id="view.id" :on-back="back" />
    </div>

    <template v-else>
      <UTabs
        v-model="tab"
        :items="items"
        :content="false"
        variant="link"
        color="neutral"
        class="shrink-0"
        :ui="{ list: 'border-mail-line', trigger: 'min-h-11 px-0 me-5 text-sm font-medium data-[state=active]:text-mail-ink text-mail-ink-3', indicator: 'bg-mail-ink', label: '' }"
      />

      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pt-3 pb-3" :aria-busy="mail.state.value === 'loading'">
        <!-- Loading and errors -->
        <template v-if="mail.state.value === 'loading'">
          <div v-for="i in 2" :key="i" class="flex flex-col gap-2 rounded-mail-card bg-mail-card p-4 shadow-mail-ring">
            <USkeleton class="h-4 w-1/2 rounded-full" />
            <USkeleton class="h-3 w-1/3 rounded-full" />
          </div>
          <p v-if="mail.slow.value" class="flex items-center gap-2 text-sm text-mail-ink-3">
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
            Still loading
          </p>
        </template>
        <MailLoadError v-else-if="mail.state.value === 'error'" title="Could not load mail." :detail="mail.error.value" @retry="mail.retry" />

        <MailDraftList
          v-else-if="tab === 'drafts'"
          :drafts="mail.drafts.value"
          :queued="mail.queued.value"
          :discarded="mail.discarded.value"
          :unread="mail.unread.value"
          :selected="props.selected"
          @open="id => open({ kind: 'draft', id })"
          @replies="tab = 'replies'"
        >
          <template v-if="$slots['empty-action']" #empty-action>
            <slot name="empty-action" />
          </template>
        </MailDraftList>
        <MailSentList v-else-if="tab === 'sent'" :sent="mail.sent.value" :replies="mail.replies.value" :selected="props.selected" @open="openThread" />
        <MailReplyList v-else :replies="mail.replies.value" :sent-count="mail.sent.value.length" @open="openThread" @sent="tab = 'sent'" />
      </div>

      <!-- A host that passes a footer slot (even an empty one) owns the bottom bar. -->
      <div v-if="$slots.footer" class="shrink-0 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] empty:hidden">
        <slot name="footer" :count="mail.reviewable.value.length" :review="openReview" />
      </div>
      <div v-else-if="tab === 'drafts' && mail.state.value === 'ready' && mail.reviewable.value.length" class="shrink-0 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <p class="mb-2 flex items-center justify-center gap-1.5 text-xs text-mail-ink-3">
          <UIcon name="i-lucide-shield-check" class="size-3.5" />
          Nothing is sent until you tap Send
        </p>
        <UButton
          :label="mail.reviewable.value.length === 1 ? 'Review 1 draft' : `Review all ${mail.reviewable.value.length}`"
          icon="i-lucide-mail-check"
          color="neutral"
          size="xl"
          block
          class="min-h-13"
          @click="openReview"
        />
      </div>
    </template>
  </div>
</template>
