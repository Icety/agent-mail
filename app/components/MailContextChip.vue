<script setup lang="ts">
// Where a mail belongs ("iCulture · Outreach"), linking there when it has a place. Generic: any
// feature can pass a label and a link.
const props = defineProps<{
  label: string
  href?: string | null
}>()
</script>

<template>
  <ULink
    v-if="props.href"
    :to="props.href"
    class="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-mail-inset px-3 text-xs font-medium text-mail-ink-2 hover:text-mail-ink dark:bg-mail-raised"
  >
    <UIcon name="i-lucide-crosshair" class="size-3.5 shrink-0" />
    <span class="truncate">{{ props.label }}</span>
  </ULink>
  <span v-else class="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-mail-inset px-3 text-xs font-medium text-mail-ink-2 dark:bg-mail-raised">
    <UIcon name="i-lucide-crosshair" class="size-3.5 shrink-0" />
    <span class="truncate">{{ props.label }}</span>
  </span>
</template>
