<script setup lang="ts">
import type { IncomingMail, MailAddress, AddressKind, InboundView } from '../../shared/types'
import { ADDRESS_KINDS } from '../../shared/types'
import { ADDRESS_KIND_LABELS, categoryPill, domainOf } from '../utils/inboundView'
import { mailErrorMessage } from '../utils/mailApi'

// The inbox's lists: mail on the project addresses (OpenMail), newest first, in three views, plus
// the way out to the drafts and who handles each address. 'pane': the desktop column next to an
// opened mail. 'page': the phone screen. The chosen view survives opening a mail.
// Inbox: what waits for the owner. Low priority: what the reader filtered out (DMARC reports,
// newsletters, bounces). Done: closed, answered, or closed by an agent.
const props = withDefaults(defineProps<{ variant?: 'pane' | 'page' }>(), { variant: 'pane' })
const SEGMENTED_BLOCK_UI = { list: 'p-1', trigger: 'h-10 flex-1 text-[13px] font-medium' } as const

const views: { label: string, value: InboundView }[] = [
  { label: 'Inbox', value: 'inbox' },
  { label: 'Low priority', value: 'noise' },
  { label: 'Done', value: 'done' },
]
const view = useState<InboundView>('mail-inbox-view', () => 'inbox')
const empty: Record<InboundView, { title: string, body: string }> = {
  inbox: { title: 'No mail waiting', body: 'New mail on your project addresses shows up here and in the chat of the agent that owns the address.' },
  noise: { title: 'Nothing filtered', body: 'Reports, newsletters and other low-priority mail land here instead of in the inbox.' },
  done: { title: 'Nothing done yet', body: 'Mail you closed or answered shows up here.' },
  all: { title: 'No mail', body: '' },
}
const { data: mails, error, refresh } = await useFetch<IncomingMail[]>('/api/mail/inbound', { query: computed(() => ({ view: view.value })), default: () => [] })
const { data: addresses, refresh: refreshAddresses } = await useFetch<MailAddress[]>('/api/mail/addresses', { default: () => [] })
useMailLive('mail.inbound', () => { void refresh() })

const route = useRoute()
const isPane = computed(() => props.variant === 'pane')
const activeId = computed(() => isPane.value && route.path.startsWith('/mail/in/') ? String(route.params.id ?? '') : '')

const host = useMailClientHost()
const agentItems = computed(() => [{ label: host.assistantLabel, value: '' }, ...(host.agents?.value ?? []).map(a => ({ label: a.name, value: a.id }))])
const kindItems = ADDRESS_KINDS.map(kind => ({ label: ADDRESS_KIND_LABELS[kind], value: kind }))

const toast = useToast()
const save = async (address: MailAddress, values: { kind?: AddressKind, agentId?: string | null }) => {
  try {
    await $fetch(`/api/mail/addresses/${encodeURIComponent(address.id)}`, { method: 'PATCH', body: values })
    await refreshAddresses()
  }
  catch (err) {
    toast.add({ title: mailErrorMessage(err), color: 'error' })
  }
}
const showAddresses = ref(false)
</script>

<template>
  <div class="flex min-h-0 flex-col" :class="isPane ? 'h-full' : ''">
    <header v-if="isPane" class="flex shrink-0 items-center gap-2 px-5 pt-5 pb-3">
      <h1 class="flex-1 font-mail-display text-[28px]">Inbox</h1>
      <MailDraftsLink small />
    </header>

    <div class="shrink-0" :class="isPane ? 'px-3 pb-2' : 'mb-4'">
      <UTabs v-model="view" :items="views" variant="pill" :content="false" class="w-full" :class="!isPane && 'sm:w-96'" :ui="SEGMENTED_BLOCK_UI" />
    </div>

    <div class="min-h-0" :class="isPane ? 'flex-1 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]' : ''">
      <MailLoadError v-if="error" title="The inbox did not load" :detail="mailErrorMessage(error)" @retry="refresh()" />
      <MailEmptyState v-else-if="!mails.length" icon="i-lucide-inbox" :title="empty[view].title" :body="empty[view].body" :card="!isPane" />
      <div v-else :class="isPane ? 'flex flex-col gap-0.5' : 'rounded-mail-card bg-mail-card px-4 shadow-mail-lift'">
        <template v-if="isPane">
          <NuxtLink
            v-for="mail in mails"
            :key="mail.id"
            :to="`/mail/in/${mail.id}`"
            class="flex min-w-0 flex-col gap-0.5 rounded-mail-tile p-3 transition-colors hover:bg-mail-card/70 focus-visible:outline-2 focus-visible:outline-mail-ink"
            :class="activeId === mail.id && 'bg-mail-card shadow-mail-lift hover:bg-mail-card'"
            :aria-current="activeId === mail.id ? 'page' : undefined"
          >
            <div class="flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-[13.5px] font-medium text-mail-ink">{{ mail.fromName || mail.fromAddress }}</span>
              <span class="shrink-0 text-[11.5px] text-mail-ink-3 tabular-nums">{{ formatMailTime(mail.receivedAt, 'relative') }}</span>
            </div>
            <p class="truncate text-[13px] text-mail-ink-2">{{ mail.subject }}</p>
            <p v-if="mail.summary" class="line-clamp-2 text-[12.5px] text-mail-ink-3">{{ mail.summary }}</p>
            <div class="mt-1 flex flex-wrap items-center gap-1.5">
              <MailStatusPill v-bind="categoryPill(mail)" />
              <span class="text-[11.5px] text-mail-ink-3">{{ domainOf(mail.toAddress) }}</span>
              <span v-if="mail.drafts.length" class="text-[11.5px] text-mail-ink-3">{{ mail.drafts.length === 1 ? '1 draft' : `${mail.drafts.length} drafts` }}</span>
            </div>
          </NuxtLink>
        </template>
        <template v-else>
          <MailListRow v-for="mail in mails" :key="mail.id" :to="`/mail/in/${mail.id}`">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate font-medium">{{ mail.fromName || mail.fromAddress }}</span>
                <span class="ms-auto shrink-0 text-xs text-mail-ink-3">{{ formatMailTime(mail.receivedAt, 'relative') }}</span>
              </div>
              <p class="truncate text-sm">{{ mail.subject }}</p>
              <p v-if="mail.summary" class="line-clamp-2 text-sm text-mail-ink-3">{{ mail.summary }}</p>
              <div class="mt-1.5 flex flex-wrap items-center gap-2">
                <MailStatusPill v-bind="categoryPill(mail)" />
                <span class="text-xs text-mail-ink-3">{{ domainOf(mail.toAddress) }}</span>
                <span v-if="mail.drafts.length" class="text-xs text-mail-ink-3">{{ mail.drafts.length === 1 ? '1 draft' : `${mail.drafts.length} drafts` }}</span>
              </div>
            </div>
          </MailListRow>
        </template>
      </div>

      <div :class="isPane ? 'mt-4 px-1' : 'mt-8'">
        <UButton
          :label="showAddresses ? 'Hide addresses' : `Addresses (${addresses.length})`"
          :icon="showAddresses ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          color="neutral" variant="ghost" :size="isPane ? 'sm' : 'md'" class="-ms-2.5" :class="isPane ? 'min-h-9 text-[13px]' : 'min-h-11'"
          @click="showAddresses = !showAddresses"
        />
        <div v-if="showAddresses" class="mt-2 rounded-mail-card bg-mail-card px-4 shadow-mail-lift">
          <div v-for="address in addresses" :key="address.id" class="flex flex-col gap-2 border-mail-line py-3 not-first:border-t" :class="!isPane && 'sm:flex-row sm:items-center'">
            <span class="min-w-0 flex-1 truncate font-medium" :class="isPane && 'text-sm'">{{ address.address }}</span>
            <USelect
              :model-value="address.kind" :items="kindItems" class="w-full" :class="!isPane && 'sm:w-44'" :aria-label="`How ${host.appName} treats this address`"
              @update:model-value="kind => save(address, { kind: kind as AddressKind })"
            />
            <USelect
              :model-value="address.agentId ?? ''" :items="agentItems" class="w-full" :class="!isPane && 'sm:w-48'" aria-label="Whose chat gets this mail"
              @update:model-value="agentId => save(address, { agentId: agentId || null })"
            />
          </div>
          <p class="border-t border-mail-line py-3 text-xs text-mail-ink-3">
            Notices go to the chat of the chosen agent. A copy to your Gmail is set in OpenMail, see docs/agent-mail.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
