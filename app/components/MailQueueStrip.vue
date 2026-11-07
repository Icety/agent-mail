<script setup lang="ts">
import type { MailDraft } from '../../shared/types'
import { mailRecipientName, mailSecondsLeft, mailWindowSeconds } from '../utils/mailView'

// Pending sends, each with its countdown and its own Undo. Queued is not sent: nothing here
// ever shows a check. Pass any drafts; only queued and sending ones are shown.
const props = withDefaults(defineProps<{
  drafts: MailDraft[]
  /** Longer line with the address ("sends in 7 s to redactie@iculture.nl"). */
  detailed?: boolean
  /** Show the "U" key on the Undo of the latest send (desktop review). */
  undoHint?: boolean
}>(), { detailed: false, undoHint: false })

const actions = useMailActions()
const now = useMailNow()
const undoing = ref<string | null>(null)

const rows = computed(() => props.drafts
  .map(d => currentMailDraft(d))
  .filter(d => d.state === 'queued' || d.state === 'sending')
  .sort((a, b) => Date.parse(a.sendAt ?? '') - Date.parse(b.sendAt ?? '')))

// The send the U key undoes: the one queued last.
const latestId = computed(() => [...rows.value].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]?.id)

const line = (d: MailDraft) => {
  const left = mailSecondsLeft(d.sendAt, now.value)
  if (d.state === 'sending' || left === 0) return 'sending now'
  return props.detailed ? `queued, sends in ${left} s to ${d.to.join(', ')}` : `queued, ${left} s`
}

const undo = async (d: MailDraft) => {
  undoing.value = d.id
  await actions.undo(d)
  undoing.value = null
}
</script>

<template>
  <div v-if="rows.length" class="overflow-hidden rounded-mail-panel bg-mail-action text-mail-on-action shadow-mail-lift-hi" role="status" aria-live="polite">
    <div v-for="d in rows" :key="d.id" class="flex min-h-14 items-center gap-3 border-t border-white/10 py-2 ps-3 pe-2 first:border-t-0 dark:border-black/10">
      <MailCountdown :send-at="d.sendAt" :total="mailWindowSeconds(d)" size="sm" />
      <p class="min-w-0 flex-1 text-sm leading-snug">
        <span class="font-semibold">{{ mailRecipientName(d) }}</span>
        <span class="opacity-75"> · {{ line(d) }}</span>
      </p>
      <UButton
        v-if="d.state === 'queued' && mailSecondsLeft(d.sendAt, now) > 0"
        icon="i-lucide-undo-2"
        label="Undo"
        color="neutral"
        variant="soft"
        class="min-h-11 bg-white/12 px-4 text-mail-on-action hover:bg-white/20 sm:min-h-9 sm:px-3.5 dark:bg-black/10 dark:hover:bg-black/15"
        :loading="undoing === d.id"
        :aria-label="`Undo send to ${mailRecipientName(d)}`"
        @click="undo(d)"
      >
        <template v-if="props.undoHint && d.id === latestId" #trailing>
          <UKbd value="U" variant="subtle" class="ms-0.5" />
        </template>
      </UButton>
    </div>
  </div>
</template>
