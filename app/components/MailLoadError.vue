<script setup lang="ts">
// Something did not load: what, the reason in small print, and Retry.
const props = withDefaults(defineProps<{ title: string, detail?: string | null }>(), { detail: null })
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="flex items-center gap-3 rounded-mail-panel bg-mail-warn-tint p-3.5 text-mail-warn-deep" role="alert">
    <UIcon name="i-lucide-triangle-alert" class="size-5 shrink-0" />
    <div class="min-w-0 flex-1 text-sm">
      <p class="font-semibold">{{ props.title }}</p>
      <p v-if="props.detail" class="text-xs opacity-85">{{ props.detail }}</p>
    </div>
    <UButton label="Retry" icon="i-lucide-refresh-cw" color="neutral" variant="outline" class="min-h-10 bg-mail-card" @click="emit('retry')" />
  </div>
</template>
