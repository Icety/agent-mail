<script setup lang="ts">
import { mailSecondsLeft } from '../utils/mailView'

// The undo window as a draining ring with the seconds left inside it.
const props = withDefaults(defineProps<{
  sendAt: string | null
  /** Length of the whole window in seconds. */
  total?: number
  size?: 'sm' | 'md'
}>(), { total: 10, size: 'md' })

const now = useMailNow()
const left = computed(() => mailSecondsLeft(props.sendAt, now.value))
const fraction = computed(() => {
  if (!props.sendAt) return 0
  const ms = Date.parse(props.sendAt) - now.value
  return Math.min(1, Math.max(0, ms / (props.total * 1000)))
})

const R = 15
const C = 2 * Math.PI * R
</script>

<template>
  <span
    class="relative inline-flex shrink-0 items-center justify-center"
    :class="props.size === 'sm' ? 'size-7' : 'size-9'"
    role="timer"
    :aria-label="`${left} seconds left`"
  >
    <svg viewBox="0 0 36 36" class="absolute inset-0 size-full -rotate-90" aria-hidden="true">
      <circle cx="18" cy="18" :r="R" fill="none" stroke="currentColor" stroke-opacity="0.22" stroke-width="3" />
      <circle
        cx="18" cy="18" :r="R" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"
        :stroke-dasharray="C" :stroke-dashoffset="C * (1 - fraction)"
        class="transition-[stroke-dashoffset] duration-300 ease-linear"
      />
    </svg>
    <span class="font-semibold tabular-nums" :class="props.size === 'sm' ? 'text-xs' : 'text-sm'">{{ left }}</span>
  </span>
</template>
