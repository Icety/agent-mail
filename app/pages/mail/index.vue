<script setup lang="ts">
// Every draft, sent mail and reply, or those of one agent or chat (?agent=, ?conversation=).
// ?thread=<draft id> opens that sent thread; ?draft=<draft id> opens that draft with its actions
// (edit, revise, send), which is where a reply written from an inbound mail lands.
definePageMeta({ hideTabBar: true })
const host = useMailClientHost()
useHead({ title: `Mail · ${host.appName}` })

const route = useRoute()
const one = (v: unknown): string | null => typeof v === 'string' && v ? v : null
const agentId = computed(() => one(route.query.agent))
const conversationId = computed(() => one(route.query.conversation))
const thread = computed(() => one(route.query.thread))
const draft = computed(() => one(route.query.draft))

const subtitle = computed(() => {
  if (conversationId.value) return host.conversationTitle?.(conversationId.value) ?? 'One chat'
  if (agentId.value) return 'One agent'
  return 'Drafts, sent mail and replies from every agent'
})
// While a draft or thread is open the panel shows its own back button: the page header steps aside.
const listing = ref(!thread.value && !draft.value)
</script>

<template>
  <div class="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col pt-[max(1rem,env(safe-area-inset-top))] sm:px-1 sm:pt-8" style="--mail-surface: var(--color-mail-ground)">
    <MailPageHeader v-if="listing" title="Mail" :subtitle="subtitle" back="/" class="mb-3 shrink-0 px-4 sm:px-5">
      <template #actions>
        <UButton label="Inbox" icon="i-lucide-inbox" to="/mail/inbox" color="neutral" variant="outline" class="min-h-11" />
      </template>
    </MailPageHeader>
    <MailPanel
      :key="`${agentId}:${conversationId}`"
      :agent-id="agentId"
      :conversation-id="conversationId"
      :thread="thread"
      :draft="draft"
      @view="kind => { listing = kind === 'list' }"
    />
  </div>
</template>
