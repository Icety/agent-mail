<script setup lang="ts">
import type { MailReply } from '../../shared/types'
import { mailContextParts, mailInitials, mailWhen } from '../utils/mailView'

// A reply that came back. chat: the amber "Reply received" card between messages. panel: the
// card in the Replies tab with what the agent did about it.
const props = withDefaults(defineProps<{
  reply: MailReply
  variant?: 'chat' | 'panel'
  /** Chip of the mail it answers ("Hoormij · Outreach"). */
  contextLabel?: string | null
  contextHref?: string | null
  /** Called by "Read"; default opens the thread on the mail page. */
  onRead?: (draftId: string) => void
}>(), { variant: 'panel', contextLabel: null, contextHref: null, onRead: undefined })

const unread = computed(() => !props.reply.readAt)
const when = computed(() => mailWhen(props.reply.receivedAt))
const place = computed(() => mailContextParts(props.contextLabel).place)
const read = () => props.onRead ? props.onRead(props.reply.draftId) : navigateTo({ path: '/mail', query: { thread: props.reply.draftId } })
</script>

<template>
  <article
    v-if="props.variant === 'chat'"
    class="overflow-hidden rounded-mail-card bg-mail-card ring-[1.5px] ring-mail-warn-fill"
    :aria-label="`Reply from ${props.reply.fromName}`"
  >
    <header class="flex items-center gap-2 bg-mail-warn-tint px-4 py-2.5 text-sm font-semibold text-mail-warn-deep">
      <UIcon name="i-lucide-reply" class="size-4" />
      <span class="flex-1">Reply received</span>
      <span class="tabular-nums">{{ when }}</span>
    </header>
    <div class="flex flex-col gap-2 px-4 pt-3 pb-3.5">
      <div class="flex items-center gap-2.5">
        <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-mail-warn-tint text-sm font-semibold text-mail-warn-deep">{{ mailInitials(props.reply.fromName) }}</span>
        <div class="min-w-0">
          <p class="font-semibold text-mail-ink">
            {{ props.reply.fromName }}
          </p>
          <p class="text-xs break-all text-mail-ink-3">
            {{ props.reply.fromAddress }}
          </p>
        </div>
      </div>
      <p class="text-sm font-semibold text-mail-ink">
        {{ props.reply.subject }}
      </p>
      <p class="line-clamp-2 text-sm text-mail-ink-2">
        {{ props.reply.body }}
      </p>
    </div>
    <footer class="flex items-center gap-2 border-t border-mail-line px-3 py-2.5">
      <MailContextChip v-if="props.contextLabel" :label="props.contextLabel" :href="props.contextHref" class="me-auto" />
      <span v-else class="me-auto" />
      <UButton label="Read" color="neutral" variant="soft" class="min-h-9 px-4 max-sm:min-h-11" @click="read" />
    </footer>
  </article>

  <article
    v-else
    class="flex flex-col gap-3 rounded-mail-card p-4"
    :class="unread ? 'bg-mail-card shadow-mail-lift' : 'bg-transparent ring-1 ring-mail-line-strong'"
    :aria-label="`Reply from ${props.reply.fromName}`"
  >
    <div class="flex items-start gap-3">
      <span class="relative flex size-10 shrink-0 items-center justify-center rounded-full font-semibold" :class="unread ? 'bg-mail-warn-tint text-mail-warn-deep' : 'bg-mail-inset text-mail-ink-2 dark:bg-mail-raised'">
        {{ mailInitials(props.reply.fromName) }}
        <span v-if="unread" class="absolute -end-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-mail-warn-deep text-mail-on-fill ring-2 ring-mail-card">
          <UIcon name="i-lucide-reply" class="size-3" />
        </span>
      </span>
      <div class="min-w-0 flex-1">
        <p class="font-semibold text-mail-ink">
          {{ props.reply.fromName }}
        </p>
        <p class="text-xs break-all text-mail-ink-3">
          {{ props.reply.fromAddress }}
        </p>
      </div>
      <span class="shrink-0 text-xs text-mail-ink-3 tabular-nums">{{ when }}</span>
    </div>
    <div>
      <p class="text-sm font-semibold text-mail-ink">
        {{ props.reply.subject }}
      </p>
      <p class="mt-1 line-clamp-2 text-sm text-mail-ink-2">
        {{ props.reply.body }}
      </p>
    </div>
    <div v-if="props.contextLabel || unread" class="flex flex-wrap items-center gap-2">
      <MailContextChip v-if="props.contextLabel" :label="props.contextLabel" :href="props.contextHref" />
      <MailStatusPill v-if="unread" label="New reply" tone="reply" />
    </div>
    <p v-if="props.reply.agentNote" class="flex gap-2 rounded-mail-panel bg-mail-ok-tint px-3 py-2.5 text-sm text-mail-ink">
      <UIcon name="i-lucide-bot" class="mt-0.5 size-4 shrink-0 text-mail-ok-deep" />
      <span><span class="font-semibold text-mail-ok-deep">Agent</span> {{ props.reply.agentNote }}</span>
    </p>
    <div class="flex items-center gap-2">
      <UButton
        v-if="props.contextHref"
        :to="props.contextHref"
        :label="place ? `Open ${place}` : 'Open'"
        icon="i-lucide-table-2"
        color="neutral"
        variant="soft"
        class="min-h-10 px-3.5 max-sm:min-h-11"
      />
      <UButton label="Read reply" trailing-icon="i-lucide-chevron-right" color="neutral" class="ms-auto min-h-10 px-4 max-sm:min-h-11" @click="read" />
    </div>
  </article>
</template>
