<script setup lang="ts">
import { mailToneClasses, type MailUiTone } from '../utils/mailTone'

// A status as a soft pill with a dot ("Replied", "Contacted", "Running"). With `menu` it is a
// button with a chevron, ready to be the trigger of a UDropdownMenu. `outline` is for quiet states (Skip).
const props = withDefaults(defineProps<{
  label: string
  tone?: MailUiTone
  menu?: boolean
  outline?: boolean
}>(), { tone: 'neutral', menu: false, outline: false })

const classes = computed(() => props.outline ? 'text-mail-ink-3 shadow-[inset_0_0_0_1px_var(--color-mail-line-strong)]' : mailToneClasses(props.tone).soft)
</script>

<template>
  <component
    :is="props.menu ? 'button' : 'span'"
    :type="props.menu ? 'button' : undefined"
    class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full ps-2 pe-2.5 text-xs font-semibold whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current"
    :class="[classes, props.menu && 'cursor-pointer pe-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current']"
  >
    {{ props.label }}
    <UIcon v-if="props.menu" name="i-lucide-chevron-down" class="-ms-0.5 size-3.5 opacity-70" />
  </component>
</template>
