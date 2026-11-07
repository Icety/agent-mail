<script setup lang="ts">
import { mailToneClasses, type MailUiTone } from '../utils/mailTone'

// An icon in a tinted square: layer and project icons, list leads, notices. Without a tone the
// caller colours it (class).
type MailIconTileSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'header'

const props = withDefaults(defineProps<{
  icon: string
  tone?: MailUiTone
  size?: MailIconTileSize
  /** Full colour (layer tiles) instead of the pale tint. */
  solid?: boolean
  /** Inset ring in the tone's colour (project agents). */
  ring?: boolean
  round?: boolean
  /** Overrides the icon size for this tile size. */
  iconClass?: string
}>(), { tone: undefined, size: 'lg', solid: false, ring: false, round: false, iconClass: undefined })

const BOX: Record<MailIconTileSize, string> = {
  'xs': 'size-7 rounded-mail-tile-sm',
  'sm': 'size-8 rounded-mail-tile-sm',
  'md': 'size-9 rounded-mail-control',
  'lg': 'size-10 rounded-mail-tile',
  'xl': 'size-11 rounded-mail-tile',
  '2xl': 'size-[52px] rounded-mail-tile-lg',
  '3xl': 'size-14 rounded-mail-panel',
  'header': 'size-11 rounded-mail-tile sm:size-[52px] sm:rounded-mail-tile-lg',
}
const ICON: Record<MailIconTileSize, string> = {
  'xs': 'size-4',
  'sm': 'size-4',
  'md': 'size-[18px]',
  'lg': 'size-5',
  'xl': 'size-5',
  '2xl': 'size-6',
  '3xl': 'size-7',
  'header': 'size-5 sm:size-6',
}

const colour = computed(() => {
  if (!props.tone) return ''
  const tone = mailToneClasses(props.tone)
  return props.solid ? tone.solid : tone.soft
})
const style = computed(() => props.ring ? { boxShadow: `inset 0 0 0 1.5px ${mailToneClasses(props.tone).css}` } : undefined)
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center"
    :class="[BOX[props.size], colour, props.round && '!rounded-full']"
    :style="style"
    aria-hidden="true"
  >
    <UIcon :name="props.icon" :class="props.iconClass ?? ICON[props.size]" />
  </span>
</template>
