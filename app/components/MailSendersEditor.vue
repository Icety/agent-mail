<script setup lang="ts">
import type { MailSender } from '../../shared/types'
import { mailErrorMessage } from '../utils/mailApi'
import { mailInitials } from '../utils/mailView'

// The addresses one agent may draft mail from: list, add, make default, remove. For any agent
// (the assistant, a project agent). Shares its cache with the From picker, so changes show up there at
// once. Place it inside your own section or card; it brings no frame of its own.
const props = defineProps<{ agentId: string }>()
const emit = defineEmits<{ change: [senders: MailSender[]] }>()

const { senders, state, error, reload, add, setDefault, remove } = useMailSenders(() => props.agentId)
const toast = useToast()

const name = ref('')
const address = ref('')
const tried = ref(false)
const busy = ref<string | null>(null)
const confirming = ref<string | null>(null)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const nameError = computed(() => tried.value && !name.value.trim() ? 'Add a name, as recipients will see it' : undefined)
const addressError = computed(() => {
  if (!tried.value) return undefined
  const value = address.value.trim().toLowerCase()
  if (!EMAIL.test(value)) return 'Not an email address'
  if (senders.value.some(s => s.address.toLowerCase() === value)) return 'Already in the list'
  return undefined
})

const attempt = async (key: string, title: string, fn: () => Promise<unknown>): Promise<boolean> => {
  busy.value = key
  try {
    await fn()
    emit('change', senders.value)
    return true
  }
  catch (err) {
    console.error('[mail] senders change failed', props.agentId, key, err)
    toast.add({ title, description: mailErrorMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
    return false
  }
  finally {
    busy.value = null
  }
}

const submit = async () => {
  tried.value = true
  if (nameError.value || addressError.value) return
  const ok = await attempt('add', 'Address not added', () => add({
    name: name.value.trim(),
    address: address.value.trim(),
    isDefault: senders.value.length === 0,
  }))
  if (!ok) return
  name.value = ''
  address.value = ''
  tried.value = false
}
const makeDefault = (s: MailSender) => attempt(`default:${s.id}`, 'Default not changed', () => setDefault(s))
const confirmRemove = async (s: MailSender) => {
  if (await attempt(`remove:${s.id}`, 'Address not removed', () => remove(s))) confirming.value = null
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-mail-ink-3">
      The agent drafts mail only from these addresses. The default is used when it does not pick one. Nothing is sent until you tap Send.
    </p>

    <div v-if="state === 'loading'" class="flex flex-col gap-2" aria-busy="true">
      <USkeleton class="h-14 w-full rounded-mail-panel" />
      <USkeleton class="h-14 w-full rounded-mail-panel" />
    </div>
    <MailLoadError v-else-if="state === 'error'" title="Could not load the addresses." :detail="error" @retry="reload" />

    <ul v-else-if="senders.length" class="flex flex-col rounded-mail-panel bg-mail-inset px-3 sm:px-3.5 dark:bg-mail-raised/70">
      <li v-for="s in senders" :key="s.id" class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-mail-line py-3 last:border-b-0">
        <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-mail-action text-xs font-semibold text-mail-on-action">{{ mailInitials(s.name) }}</span>
        <div class="min-w-0 flex-1 basis-40">
          <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-mail-ink">
            {{ s.name }}
            <MailStatusPill v-if="s.isDefault" label="Default" tone="ok" />
          </p>
          <MailAddress :address="s.address" class="text-xs text-mail-ink-2" />
        </div>
        <!-- Actions on their own line on a phone, beside the address on wider screens. -->
        <div class="flex items-center gap-1.5 max-sm:w-full max-sm:ps-11">
          <UButton
            v-if="!s.isDefault"
            label="Make default"
            icon="i-lucide-star"
            color="neutral"
            variant="soft"
            size="sm"
            class="min-h-11 px-3 sm:min-h-9"
            :loading="busy === `default:${s.id}`"
            @click="makeDefault(s)"
          />
          <UButton
            label="Remove"
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="sm"
            class="min-h-11 px-3 sm:min-h-9"
            :aria-label="`Remove ${s.address}`"
            :aria-expanded="confirming === s.id"
            @click="confirming = confirming === s.id ? null : s.id"
          />
        </div>
        <div v-if="confirming === s.id" class="flex w-full flex-wrap items-center justify-end gap-2 rounded-mail-control bg-mail-err-tint p-2.5 ps-3" role="alert">
          <p class="me-auto min-w-0 basis-48 text-sm text-mail-err-deep">
            Remove {{ s.address }}? Drafts from it can no longer be sent.
          </p>
          <UButton label="Cancel" color="neutral" variant="ghost" class="min-h-11 sm:min-h-10" @click="confirming = null" />
          <UButton label="Remove" color="error" class="min-h-11 px-4 sm:min-h-10" :loading="busy === `remove:${s.id}`" @click="confirmRemove(s)" />
        </div>
      </li>
    </ul>
    <p v-else class="flex items-center gap-2 rounded-mail-panel bg-mail-inset p-3.5 text-sm text-mail-ink-2 dark:bg-mail-raised/70">
      <UIcon name="i-lucide-mail-plus" class="size-4 shrink-0" />
      No addresses yet. Add one so the agent can draft mail.
    </p>

    <form class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.3fr_auto] sm:items-start" novalidate @submit.prevent="submit">
      <UFormField label="Name" :error="nameError">
        <UInput v-model="name" placeholder="Your name" autocomplete="name" class="w-full" />
      </UFormField>
      <UFormField label="Address" :error="addressError">
        <UInput v-model="address" type="email" placeholder="you@example.com" autocomplete="email" class="w-full" />
      </UFormField>
      <UButton
        type="submit"
        label="Add address"
        icon="i-lucide-plus"
        color="neutral"
        class="min-h-11 justify-center px-4 sm:mt-6 sm:min-h-9"
        :loading="busy === 'add'"
      />
    </form>
  </div>
</template>
