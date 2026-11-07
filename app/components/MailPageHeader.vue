<script setup lang="ts">
import type { MailUiTone } from '../utils/mailTone'

// Page title row: optional back link, the layer's icon tile, a display title and a subtitle.
// Actions sit on the right and wrap under the title on a phone. Below lg, `phoneBack` and the
// `phone-actions` slot add a row above the title: a back button on the left, actions on the right.
const props = withDefaults(defineProps<{
  title: string
  subtitle?: string
  icon?: string
  tone?: MailUiTone
  /** Route to go back to; shows a back button. */
  back?: string
  /** Route for the phone row's back button (below lg). */
  phoneBack?: string
  phoneBackLabel?: string
}>(), { subtitle: undefined, icon: undefined, tone: 'neutral', back: undefined, phoneBack: undefined, phoneBackLabel: 'Back' })

</script>

<template>
  <div>
    <div v-if="props.phoneBack || $slots['phone-actions']" class="mb-4 flex items-center justify-between gap-2 lg:hidden">
      <UButton
        v-if="props.phoneBack"
        :to="props.phoneBack"
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="outline"
        class="size-11 justify-center bg-mail-card shadow-mail-lift ring-0"
        :aria-label="props.phoneBackLabel"
      />
      <slot name="phone-actions" />
    </div>
    <header class="flex flex-wrap items-center gap-x-3 gap-y-3 sm:gap-x-4">
      <div class="flex min-w-0 flex-1 basis-64 items-center gap-3 sm:gap-4">
        <UButton
          v-if="props.back"
          :to="props.back"
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          size="lg"
          aria-label="Back"
          class="-ms-2 size-11 shrink-0 justify-center"
        />
        <MailIconTile v-if="props.icon" :icon="props.icon" :tone="props.tone" size="header" solid />
        <div class="min-w-0">
          <h1 class="truncate font-mail-display text-[28px] sm:text-[32px]">{{ props.title }}</h1>
          <p v-if="props.subtitle || $slots.subtitle" class="mt-1 truncate text-sm text-mail-ink-3">
            <slot name="subtitle">{{ props.subtitle }}</slot>
          </p>
        </div>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
  </div>
</template>
