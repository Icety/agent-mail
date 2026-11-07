<script setup lang="ts">
import type { MailDraft } from '../../shared/types'
import { mailInitials } from '../utils/mailView'

// The From line. Always shows the full address. With two or more senders and an editable draft
// it is a picker; choosing saves the draft (a new revision, so any queued send is cancelled).
const props = withDefaults(defineProps<{
  draft: MailDraft
  editable?: boolean
}>(), { editable: true })

const { senders } = useMailSenders(() => props.draft.agentId)
const actions = useMailActions()
const open = ref(false)
const saving = ref(false)

const current = computed(() => senders.value.find(s => s.address === props.draft.from))
const name = computed(() => current.value?.name ?? null)
const canPick = computed(() => props.editable && senders.value.length > 1)

const choose = async (address: string) => {
  open.value = false
  if (address === props.draft.from) return
  saving.value = true
  await actions.edit(props.draft, { from: address })
  saving.value = false
}
</script>

<template>
  <UPopover v-if="canPick" v-model:open="open" :content="{ align: 'start', sideOffset: 6 }">
    <button
      type="button"
      class="flex min-h-9 max-w-full items-center gap-2 rounded-full bg-mail-card max-sm:min-h-11 py-1 ps-1 pe-2.5 text-start text-sm shadow-mail-ring hover:shadow-mail-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mail-ink"
      :aria-label="`From ${props.draft.from}. Change sender`"
    >
      <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-mail-action text-[10px] font-semibold text-mail-on-action">{{ mailInitials(name ?? props.draft.from) }}</span>
      <span class="min-w-0">
        <span v-if="name" class="me-1.5 hidden font-semibold text-mail-ink @md:inline">{{ name }}</span>
        <MailAddress :address="props.draft.from" :class="name ? 'font-semibold text-mail-ink @md:font-normal @md:text-mail-ink-2' : 'font-semibold text-mail-ink'" />
      </span>
      <UIcon :name="saving ? 'i-lucide-loader-circle' : 'i-lucide-chevrons-up-down'" class="size-4 shrink-0 text-mail-ink-3" :class="saving && 'animate-spin'" />
    </button>
    <template #content>
      <div class="w-72 max-w-[calc(100vw-2rem)] p-1.5">
        <p class="px-2.5 pt-1.5 pb-1 text-xs font-medium text-mail-ink-3">
          Send from
        </p>
        <button
          v-for="s in senders"
          :key="s.id"
          type="button"
          class="flex w-full items-center gap-2.5 rounded-mail-control px-2.5 py-2 text-start hover:bg-mail-inset"
          :class="s.address === props.draft.from && 'bg-mail-inset'"
          @click="choose(s.address)"
        >
          <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-mail-action text-[11px] font-semibold text-mail-on-action">{{ mailInitials(s.name) }}</span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold text-mail-ink">{{ s.name }}</span>
            <MailAddress :address="s.address" class="block text-xs text-mail-ink-3" />
          </span>
          <UIcon v-if="s.address === props.draft.from" name="i-lucide-check" class="size-4 shrink-0" />
        </button>
        <p class="mt-1 flex items-center gap-1.5 border-t border-mail-line px-2.5 pt-2 pb-1 text-xs text-mail-ink-3">
          <UIcon name="i-lucide-settings" class="size-3.5" />
          Senders are set per agent
        </p>
      </div>
    </template>
  </UPopover>
  <span v-else class="flex min-h-9 max-w-full items-center gap-2 text-sm">
    <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-mail-action text-[10px] font-semibold text-mail-on-action">{{ mailInitials(name ?? props.draft.from) }}</span>
    <span class="min-w-0">
      <span v-if="name" class="me-1.5 hidden font-semibold text-mail-ink @md:inline">{{ name }}</span>
      <MailAddress :address="props.draft.from" :class="name ? 'font-semibold text-mail-ink @md:font-normal @md:text-mail-ink-2' : 'font-semibold text-mail-ink'" />
    </span>
  </span>
</template>
