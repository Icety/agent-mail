<script setup lang="ts">
// "What should the agent change?": a short note plus quick picks. Send stays locked while the
// agent rewrites, which the footnote says.
const props = withDefaults(defineProps<{
  loading?: boolean
  /** Big layout for the phone sheet: full-width submit button. */
  block?: boolean
  autofocus?: boolean
}>(), { loading: false, block: false, autofocus: true })

const emit = defineEmits<{ submit: [note: string], cancel: [] }>()

const PICKS = ['Shorter', 'More personal', 'More formal', 'In English'] as const
const note = ref('')
const picked = ref<string[]>([])

const toggle = (pick: string) => {
  picked.value = picked.value.includes(pick) ? picked.value.filter(p => p !== pick) : [...picked.value, pick]
}
const text = computed(() => [picked.value.join(', '), note.value.trim()].filter(Boolean).join('. '))
const submit = () => {
  if (!text.value || props.loading) return
  emit('submit', text.value)
}
</script>

<template>
  <form class="flex flex-col gap-3" @submit.prevent="submit">
    <div v-if="!props.block" class="flex items-center gap-2 text-sm font-semibold text-mail-ok-deep">
      <UIcon name="i-lucide-wand-sparkles" class="size-4" />
      What should the agent change?
    </div>
    <div v-if="props.block">
      <UTextarea
        v-model="note"
        :autofocus="props.autofocus"
        :rows="3"
        autoresize
        placeholder="What should the agent change?"
        aria-label="What should the agent change?"
        class="w-full"
        :ui="{ base: 'rounded-mail-panel bg-mail-inset px-4 py-3 text-base ring-1 ring-mail-line-strong focus-visible:ring-2 focus-visible:ring-mail-ink' }"
        @keydown.meta.enter="submit"
      />
    </div>
    <div v-else class="flex items-center gap-2 rounded-full bg-mail-card p-1 ps-4 ring-1 ring-mail-line-strong focus-within:ring-2 focus-within:ring-mail-ink">
      <input
        v-model="note"
        :autofocus="props.autofocus"
        class="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-mail-ink outline-none placeholder:text-mail-ink-4"
        placeholder="Make it shorter, more personal"
        aria-label="What should the agent change?"
      >
      <UButton type="submit" label="Send to agent" trailing-icon="i-lucide-arrow-up" color="neutral" size="sm" :loading="props.loading" :disabled="!text" class="min-h-8 max-sm:min-h-11" />
    </div>
    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="pick in PICKS"
        :key="pick"
        :label="pick"
        :icon="picked.includes(pick) ? 'i-lucide-check' : undefined"
        color="neutral"
        :variant="picked.includes(pick) ? 'solid' : 'outline'"
        size="sm"
        class="min-h-9 px-3 max-sm:min-h-11"
        :aria-pressed="picked.includes(pick)"
        @click="toggle(pick)"
      />
    </div>
    <UButton
      v-if="props.block"
      type="submit"
      label="Ask agent"
      trailing-icon="i-lucide-arrow-up"
      color="neutral"
      size="xl"
      block
      :loading="props.loading"
      :disabled="!text"
      class="min-h-13"
    />
    <div class="flex items-center gap-2">
      <p class="flex-1 text-xs text-mail-ink-3" :class="props.block && 'text-center'">
        Send unlocks when the new version is in.
      </p>
      <UButton v-if="!props.block" label="Cancel" color="neutral" variant="ghost" size="sm" class="max-sm:min-h-11" @click="emit('cancel')" />
    </div>
  </form>
</template>
