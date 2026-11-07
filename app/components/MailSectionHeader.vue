<script setup lang="ts">
// "Needs you   3" or "Changed today   All >" above a group of cards.
const props = defineProps<{
  title: string
  count?: number
  link?: { label: string; to: string }
}>()
</script>

<template>
  <div class="mx-1 mt-6 mb-2.5 flex min-h-8 items-center gap-2">
    <h2 class="min-w-0 flex-1 truncate text-base font-semibold tracking-[-0.005em] text-mail-ink">
      {{ props.title }}
    </h2>
    <slot name="action">
      <span v-if="props.count !== undefined" class="text-xs font-medium text-mail-ink-3 tabular-nums">{{ props.count }}</span>
      <NuxtLink
        v-if="props.link"
        :to="props.link.to"
        class="-my-1.5 inline-flex min-h-11 items-center gap-0.5 text-[13px] font-medium text-mail-ink-3 hover:text-mail-ink"
      >
        {{ props.link.label }}
        <UIcon name="i-lucide-chevron-right" class="size-4" />
      </NuxtLink>
    </slot>
  </div>
</template>
