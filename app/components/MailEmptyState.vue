<script setup lang="ts">
import type { MailUiTone } from '../utils/mailTone'

// One clear empty state: an icon tile, a title, a short line, and one next action (slot).
const props = withDefaults(defineProps<{
  icon: string
  title: string
  body?: string
  tone?: MailUiTone
  /** On its own card (a list with nothing in it yet). */
  card?: boolean
}>(), { body: undefined, tone: 'neutral', card: false })

// Neutral art is quieter than a neutral tile: ink-3 instead of ink-2.
const quiet = computed(() => props.tone === 'neutral')
</script>

<template>
  <UEmpty
    variant="naked"
    :class="props.card && 'rounded-mail-card bg-mail-card shadow-mail-lift'"
    :title="props.title"
    :description="props.body"
    :ui="{
      root: 'gap-5 px-5 py-7',
      header: 'gap-2.5',
      title: 'text-lg font-semibold text-mail-ink',
      description: 'text-sm text-mail-ink-2 leading-relaxed',
    }"
  >
    <template #leading>
      <MailIconTile
        :icon="props.icon"
        :tone="quiet ? undefined : props.tone"
        size="3xl"
        icon-class="size-6"
        class="mb-1"
        :class="quiet && 'bg-mail-inset text-mail-ink-3 dark:bg-mail-raised'"
      />
    </template>
    <template v-if="$slots.action" #actions>
      <slot name="action" />
    </template>
  </UEmpty>
</template>
