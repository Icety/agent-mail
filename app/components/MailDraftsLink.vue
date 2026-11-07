<script setup lang="ts">
// The way out of the inbox to the drafts (every agent's), with how many wait for the owner.
const props = withDefaults(defineProps<{ small?: boolean }>(), { small: false })
const outbox = useMail(() => ({}))
const label = computed(() => outbox.reviewable.value.length ? `Drafts (${outbox.reviewable.value.length})` : 'Drafts')
</script>

<template>
  <UButton
    :label="label" icon="i-lucide-pen-line" to="/mail" color="neutral" variant="outline"
    :size="props.small ? 'sm' : 'md'" :class="props.small ? 'h-8 bg-mail-card px-3 text-[13px] shadow-mail-lift ring-0' : 'min-h-11'"
  />
</template>
