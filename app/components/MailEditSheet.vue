<script setup lang="ts">
import type { MailDraft } from '../../shared/types'

// Edit a draft: a tall sheet on the phone, a modal on desktop. Opened with useMailEditor().open(draft);
// the overlay passes `open` through and resolves with `close(saved)`.
// The fields are edited on top of the revision they were loaded from. Saving sends that revision,
// so a change by the agent in the meantime is never overwritten silently: on a conflict the text
// stays and the owner chooses "Load latest" or "Keep mine". Closes only after a successful save (or Cancel).
const props = defineProps<{ draft: MailDraft }>()
const emit = defineEmits<{ 'close': [saved: boolean], 'after:leave': [] }>()

// The form starts from the draft as it is now, and keeps that revision while editing.
const draft = currentMailDraft(props.draft)

const { senders } = useMailSenders(() => draft.agentId)
const actions = useMailActions()
const toast = useToast()

const base = ref(draft.revision)
const from = ref(draft.from)
const to = ref<string[]>([...draft.to])
const cc = ref<string[]>([...draft.cc])
const subject = ref(draft.subject)
const body = ref(draft.body)
const showCc = ref(draft.cc.length > 0)
const saving = ref(false)
const conflict = ref(false)
const queued = draft.state === 'queued'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const invalid = computed(() => [...to.value, ...cc.value].filter(a => !EMAIL.test(a)))
const problem = computed(() => {
  if (to.value.length === 0) return 'Add at least one recipient.'
  if (invalid.value.length) return `Not an email address: ${invalid.value.join(', ')}`
  return null
})
const senderItems = computed(() => {
  const list = senders.value.map(s => ({ label: s.address, value: s.address }))
  return list.some(s => s.value === from.value) ? list : [{ label: from.value, value: from.value }, ...list]
})

const fill = (d: MailDraft) => {
  base.value = d.revision
  from.value = d.from
  to.value = [...d.to]
  cc.value = [...d.cc]
  subject.value = d.subject
  body.value = d.body
  showCc.value = d.cc.length > 0
}

const save = async () => {
  if (problem.value || saving.value) return
  saving.value = true
  const result = await actions.saveEdit(draft.id, base.value, { from: from.value, to: to.value, cc: cc.value, subject: subject.value, body: body.value })
  saving.value = false
  if (result.ok) {
    emit('close', true)
    return
  }
  if (result.conflict) {
    conflict.value = true
    return
  }
  toast.add({ title: 'Not saved yet', description: `${result.message} Your text is still here.`, color: 'error', icon: 'i-lucide-circle-alert' })
}

// Throw away my changes and show what is there now.
const loadLatest = async () => {
  const latest = await actions.latest(draft.id)
  if (!latest) {
    toast.add({ title: 'Could not load the latest version', color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  fill(latest)
  conflict.value = false
}

// Keep my text and save it on top of the latest revision.
const keepMine = async () => {
  const latest = await actions.latest(draft.id)
  if (!latest) {
    toast.add({ title: 'Could not load the latest version', color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  base.value = latest.revision
  conflict.value = false
  await save()
}
</script>

<template>
  <MailOverlay
    title="Edit draft"
    :description="`To ${draft.to.join(', ')}`"
    width="lg"
    tall
    @update:open="v => !v && emit('close', false)"
    @after:leave="emit('after:leave')"
  >
    <form id="mail-edit" class="flex flex-col gap-4" @submit.prevent="save">
      <div v-if="conflict" class="flex flex-col gap-3 rounded-mail-panel bg-mail-warn-tint p-3.5 text-mail-warn-deep" role="alert">
        <p class="flex items-start gap-2 text-sm">
          <UIcon name="i-lucide-git-compare" class="mt-0.5 size-4 shrink-0" />
          <span><span class="font-semibold">This draft changed while you were editing.</span> Your text is not saved yet.</span>
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton label="Load latest" icon="i-lucide-refresh-cw" color="neutral" variant="outline" class="min-h-10 bg-mail-card px-4 max-sm:min-h-11" @click="loadLatest" />
          <UButton label="Keep mine" icon="i-lucide-check" color="neutral" class="min-h-10 px-4 max-sm:min-h-11" :loading="saving" @click="keepMine" />
        </div>
      </div>
      <p v-else-if="queued" class="flex items-start gap-2 rounded-mail-control bg-mail-warn-tint px-3 py-2 text-sm text-mail-warn-deep">
        <UIcon name="i-lucide-clock" class="mt-0.5 size-4 shrink-0" />
        Saving cancels the queued send. It goes back to Drafts.
      </p>
      <UFormField label="From">
        <USelect v-if="senderItems.length > 1" v-model="from" :items="senderItems" class="w-full" />
        <p v-else class="text-sm font-semibold break-words text-mail-ink">
          {{ from }}
        </p>
      </UFormField>
      <UFormField label="To" :error="to.length === 0 ? 'Add at least one recipient' : undefined">
        <UInputTags v-model="to" placeholder="name@example.com" add-on-paste add-on-blur add-on-tab class="w-full" />
      </UFormField>
      <UFormField v-if="showCc" label="Cc">
        <UInputTags v-model="cc" placeholder="name@example.com" add-on-paste add-on-blur add-on-tab class="w-full" />
      </UFormField>
      <UButton v-else label="Add Cc" icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" class="-mt-2 min-h-9 self-start max-sm:min-h-11" @click="showCc = true" />
      <UFormField label="Subject">
        <UInput v-model="subject" class="w-full" />
      </UFormField>
      <UFormField label="Message" class="flex flex-1 flex-col">
        <UTextarea v-model="body" :rows="10" autoresize :maxrows="24" class="w-full" />
      </UFormField>
      <p v-if="problem" class="text-sm text-mail-err-deep" role="alert">
        {{ problem }}
      </p>
    </form>
    <template #footer>
      <UButton label="Cancel" color="neutral" variant="ghost" class="ms-auto min-h-11 px-4" @click="emit('close', false)" />
      <UButton
        type="submit"
        form="mail-edit"
        :label="queued ? 'Save and cancel send' : 'Save draft'"
        icon="i-lucide-check"
        color="neutral"
        class="min-h-11 px-4"
        :loading="saving"
        :disabled="Boolean(problem) || conflict"
      />
    </template>
  </MailOverlay>
</template>
