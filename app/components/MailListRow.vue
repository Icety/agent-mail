<script setup lang="ts">
import { NuxtLink } from '#components'

// One row in a list card (rounded-mail-card bg-mail-card px-4 py-1): rows are 64px high and divided by a
// hairline. A link when `to` is set.
const props = withDefaults(defineProps<{ to?: string }>(), { to: undefined })
</script>

<template>
  <component :is="props.to ? NuxtLink : 'div'" :to="props.to" class="flex min-h-16 items-center gap-3 border-mail-line py-2.5 not-first:border-t">
    <slot />
  </component>
</template>
