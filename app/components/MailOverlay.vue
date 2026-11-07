<script setup lang="ts">
import { UDrawer, UModal, USlideover } from '#components'

// One dialog that fits the screen: a bottom sheet on a phone, a centred modal or a right
// slideover on a larger screen. Slots: default (body), footer (safe-area aware), lead (before
// the title). Emits `after:leave` once closed and gone, whichever variant showed (for useOverlay).
const props = withDefaults(defineProps<{
  title: string
  description?: string
  desktop?: 'modal' | 'slideover'
  width?: 'md' | 'lg' | 'xl'
  /** Slideover only: keep the page behind usable (history next to its preview). */
  modal?: boolean
  /** Phone: a fixed height, so stepping through items does not make the sheet jump. */
  tall?: boolean
}>(), { description: undefined, desktop: 'modal', width: 'md', modal: true, tall: false })

const emit = defineEmits<{ 'after:leave': [] }>()
const open = defineModel<boolean>('open', { default: false })
const { isPhone } = useMailViewport()

const WIDTHS = { md: 'sm:max-w-[560px]', lg: 'sm:max-w-[720px]', xl: 'sm:max-w-[1040px]' } as const
const close = { color: 'neutral' as const, variant: 'outline' as const, class: 'size-11 justify-center rounded-full md:size-9' }
const shared = {
  header: 'flex shrink-0 items-start gap-3 px-5 pt-4 pb-3 min-h-0 sm:px-6 sm:pt-5',
  wrapper: 'min-w-0 flex-1',
  title: 'flex items-center gap-3 text-xl font-semibold tracking-[-0.01em] text-mail-ink',
  description: 'mt-0.5 text-[13px] text-mail-ink-3',
  close: 'static shrink-0',
  body: 'px-5 pb-4 sm:px-6',
  footer: 'flex flex-row items-center gap-2 border-t border-mail-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6',
}

const variant = computed(() => {
  if (isPhone.value) return 'drawer'
  return props.desktop
})
const ui = computed(() => {
  if (variant.value === 'drawer') {
    return {
      ...shared,
      content: `rounded-t-mail-sheet bg-mail-card shadow-mail-sheet ring-0 max-h-[94dvh] ${props.tall ? 'h-[90dvh]' : ''}`,
      container: 'gap-0 p-0 flex-1 min-h-0',
      handle: '!h-[5px] !w-10 !bg-mail-line-strong mt-2',
      body: `${shared.body} min-h-0 flex-1 overflow-y-auto`,
    }
  }
  if (variant.value === 'slideover') {
    return { ...shared, content: 'bg-mail-card max-w-[440px] divide-y-0', header: `${shared.header} border-b border-mail-line pb-4`, body: `${shared.body} pt-4 overflow-y-auto` }
  }
  return { ...shared, content: `bg-mail-card rounded-mail-sheet shadow-mail-lift-hi ring-0 divide-y-0 ${WIDTHS[props.width]}`, body: `${shared.body} pt-1 overflow-y-auto` }
})
const component = computed(() => ({ drawer: UDrawer, slideover: USlideover, modal: UModal })[variant.value])
const variantProps = computed(() => variant.value === 'slideover' ? { modal: props.modal, overlay: props.modal } : {})
const afterLeave = () => emit('after:leave')
// A drawer reports its close animation as animationEnd(false); modal and slideover as after:leave.
const listeners = computed(() => variant.value === 'drawer'
  ? { animationEnd: (opened: boolean) => { if (!opened) afterLeave() } }
  : { 'after:leave': afterLeave })
</script>

<template>
  <component
    :is="component"
    v-model:open="open"
    v-bind="variantProps"
    :title="props.title"
    :description="props.description"
    :close="close"
    :ui="ui"
    v-on="listeners"
  >
    <template #title>
      <slot name="lead" />{{ props.title }}
    </template>
    <template #body>
      <slot />
    </template>
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </component>
</template>
