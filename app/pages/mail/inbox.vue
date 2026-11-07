<script setup lang="ts">
import type { IncomingMail, MailAddress, AddressKind } from '../../../shared/types'
import { ADDRESS_KINDS } from '../../../shared/types'
import { ADDRESS_KIND_LABELS, categoryPill, domainOf } from '../../utils/inboundView'
import { mailErrorMessage } from '../../utils/mailApi'

// Mail that arrived on the project addresses (OpenMail), newest first, and who handles each address.
definePageMeta({ hideTabBar: true })
const host = useMailClientHost()
useHead({ title: `Inbox · ${host.appName}` })

const showDone = ref(false)
const { data: mails, error, refresh } = await useFetch<IncomingMail[]>('/api/mail/inbound', { query: computed(() => (showDone.value ? { done: '1' } : {})), default: () => [] })
const { data: addresses, refresh: refreshAddresses } = await useFetch<MailAddress[]>('/api/mail/addresses', { default: () => [] })
useMailLive('mail.inbound', () => { void refresh() })

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
  <div class="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 sm:pt-8">
    <MailPageHeader title="Inbox" subtitle="Mail on your project addresses" back="/mail" class="mb-5">
      <template #actions>
        <UButton :label="showDone ? 'Hide done' : 'Show done'" color="neutral" variant="ghost" size="sm" @click="showDone = !showDone" />
      </template>
    </MailPageHeader>

    <MailLoadError v-if="error" title="The inbox did not load" :detail="mailErrorMessage(error)" @retry="refresh()" />
    <MailEmptyState v-else-if="!mails.length" icon="i-lucide-inbox" title="No mail waiting" body="New mail on your project addresses shows up here and in the chat of the agent that owns the address." card />
    <div v-else class="rounded-mail-card bg-mail-card px-4 shadow-mail-lift">
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
    </div>

    <div class="mt-8">
      <UButton
        :label="showAddresses ? 'Hide addresses' : `Addresses (${addresses.length})`"
        :icon="showAddresses ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        color="neutral" variant="ghost" class="-ms-2.5 min-h-11"
        @click="showAddresses = !showAddresses"
      />
      <div v-if="showAddresses" class="mt-2 rounded-mail-card bg-mail-card px-4 shadow-mail-lift">
        <div v-for="address in addresses" :key="address.id" class="flex flex-col gap-2 border-mail-line py-3 not-first:border-t sm:flex-row sm:items-center">
          <span class="min-w-0 flex-1 truncate font-medium">{{ address.address }}</span>
          <USelect
            :model-value="address.kind" :items="kindItems" class="w-full sm:w-44" :aria-label="`How ${host.appName} treats this address`"
            @update:model-value="kind => save(address, { kind: kind as AddressKind })"
          />
          <USelect
            :model-value="address.agentId ?? ''" :items="agentItems" class="w-full sm:w-48" aria-label="Whose chat gets this mail"
            @update:model-value="agentId => save(address, { agentId: agentId || null })"
          />
        </div>
        <p class="border-t border-mail-line py-3 text-xs text-mail-ink-3">
          Notices go to the chat of the chosen agent. A copy to your Gmail is set in OpenMail, see docs/agent-mail.
        </p>
      </div>
    </div>
  </div>
</template>
