<script setup lang="ts">
import { mailContextParts, mailInitials, mailOutcomeLabel, mailWhen } from '../utils/mailView'

// A sent mail and the replies to it, newest at the bottom. Replies are marked read when shown.
// "Ask agent to draft a reply" goes to the conversation the mail came from.
const props = withDefaults(defineProps<{
  draftId: string
  onBack?: () => void
}>(), { onBack: undefined })

const { state, error, draft, replies, retry } = useMailThread(() => props.draftId)
const host = useMailClientHost()
const toast = useToast()

const { senders } = useMailSenders(() => draft.value?.agentId ?? '')
const senderName = computed(() => senders.value.find(s => s.address === draft.value?.from)?.name ?? draft.value?.from ?? '')
const showSent = ref(false)
const asking = ref(false)

const last = computed(() => replies.value.at(-1))
const place = computed(() => mailContextParts(draft.value?.contextLabel ?? null).place)
const outcome = computed(() => draft.value ? mailOutcomeLabel(draft.value, replies.value.length > 0) : null)
const mails = computed(() => 1 + replies.value.length)

const askReply = async () => {
  const d = draft.value
  const reply = last.value
  if (!d?.conversationId || !reply || !host.askAgent) return
  asking.value = true
  try {
    await host.askAgent(d.conversationId, `Draft a reply to ${reply.fromName} (${reply.fromAddress}) about "${d.subject}". Do not send it.`)
    toast.add({ title: 'Asked the agent', description: 'The draft shows up in this chat and in Drafts.', icon: 'i-lucide-wand-sparkles' })
  }
  catch (err) {
    toast.add({ title: 'Message not sent', description: String(err), color: 'error' })
  }
  finally {
    asking.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <header class="flex items-center gap-3 pb-3">
      <UButton v-if="props.onBack" icon="i-lucide-chevron-left" color="neutral" variant="ghost" class="size-10 justify-center max-sm:size-11" aria-label="Back" @click="props.onBack" />
      <template v-if="last">
        <span class="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-mail-warn-tint font-semibold text-mail-warn-deep">
          {{ mailInitials(last.fromName) }}
          <span class="absolute -end-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-mail-warn-deep text-mail-on-fill ring-2 ring-mail-ground">
            <UIcon name="i-lucide-reply" class="size-3" />
          </span>
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-mail-ink">
            {{ last.fromName }}
          </p>
          <p class="text-xs break-all text-mail-ink-3">
            {{ last.fromAddress }}
          </p>
        </div>
      </template>
      <div v-else-if="draft" class="min-w-0 flex-1">
        <p class="font-semibold text-mail-ink">
          To {{ draft.to.join(', ') }}
        </p>
        <p class="text-xs text-mail-ink-3">
          No reply yet
        </p>
      </div>
    </header>

    <div v-if="state === 'loading' && !draft" class="flex flex-col gap-3" aria-busy="true">
      <USkeleton class="h-7 w-3/4 rounded-mail-badge" />
      <USkeleton class="h-28 w-full rounded-mail-card" />
      <USkeleton class="h-40 w-full rounded-mail-card" />
    </div>
    <MailLoadError v-else-if="state === 'error' || !draft" title="Could not open this thread." :detail="error" @retry="retry" />

    <template v-else>
      <h2 class="text-xl leading-snug font-semibold text-pretty text-mail-ink">
        {{ draft.subject }}
      </h2>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <MailContextChip v-if="draft.contextLabel" :label="draft.contextLabel" :href="draft.contextHref" />
        <MailStatusPill v-if="outcome" :label="outcome.label" :tone="outcome.tone" />
        <span class="text-xs text-mail-ink-3">{{ mails }} {{ mails === 1 ? 'mail' : 'mails' }}</span>
      </div>

      <div class="mt-4 flex flex-col gap-3">
        <!-- What the owner sent -->
        <section class="rounded-mail-card bg-mail-inset p-4 dark:bg-mail-raised">
          <div class="flex items-start gap-2.5">
            <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-mail-action text-xs font-semibold text-mail-on-action">{{ mailInitials(senderName) }}</span>
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-mail-ink">
                You
              </p>
              <p class="text-xs break-all text-mail-ink-3">
                from {{ draft.from }}
              </p>
            </div>
            <span class="shrink-0 text-xs text-mail-ink-3 tabular-nums">{{ mailWhen(draft.sentAt ?? draft.updatedAt) }}</span>
          </div>
          <p v-if="showSent" class="mt-2.5 text-sm leading-relaxed whitespace-pre-wrap text-mail-ink-2 [overflow-wrap:anywhere]">
            {{ draft.body }}
          </p>
          <p v-else class="mt-2.5 line-clamp-2 text-sm leading-relaxed text-mail-ink-2">
            {{ draft.body.replace(/\s+/g, ' ') }}
          </p>
          <UButton
            :label="showSent ? 'Show less' : 'Show full mail'"
            :icon="showSent ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            color="neutral"
            variant="link"
            size="sm"
            class="mt-1 -ms-2 text-mail-ink-3 max-sm:min-h-11"
            @click="showSent = !showSent"
          />
        </section>

        <!-- Replies, newest at the bottom -->
        <section
          v-for="(reply, i) in replies"
          :key="reply.id"
          class="rounded-mail-card bg-mail-card p-4"
          :class="i === replies.length - 1 ? 'ring-[1.5px] ring-mail-warn-fill' : 'shadow-mail-lift'"
        >
          <div class="flex items-start gap-2.5">
            <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-mail-warn-tint text-sm font-semibold text-mail-warn-deep">{{ mailInitials(reply.fromName) }}</span>
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-mail-ink">
                {{ reply.fromName }}
              </p>
              <p class="text-xs break-all text-mail-ink-3">
                {{ reply.fromAddress }}
              </p>
            </div>
            <span class="shrink-0 text-xs text-mail-ink-3 tabular-nums">{{ mailWhen(reply.receivedAt) }}</span>
          </div>
          <p class="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap text-mail-ink [overflow-wrap:anywhere]">
            {{ reply.body }}
          </p>
          <p v-if="reply.agentNote" class="mt-3 flex gap-2 rounded-mail-panel bg-mail-ok-tint px-3 py-2.5 text-sm text-mail-ink">
            <UIcon name="i-lucide-bot" class="mt-0.5 size-4 shrink-0 text-mail-ok-deep" />
            <span><span class="font-semibold text-mail-ok-deep">Agent</span> {{ reply.agentNote }}</span>
          </p>
        </section>
      </div>
    </template>

    <div v-if="draft && (draft.contextHref || (last && draft.conversationId && host.askAgent))" class="sticky bottom-0 mt-auto flex gap-2 bg-gradient-to-t from-[var(--mail-surface,var(--color-mail-ground))] from-70% to-transparent pt-5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <UButton
        v-if="draft.contextHref"
        :to="draft.contextHref"
        icon="i-lucide-table-2"
        color="neutral"
        variant="outline"
        size="lg"
        class="min-h-12 min-w-0 shrink bg-mail-card px-4 ring-0 shadow-mail-lift"
        :class="!(last && draft.conversationId && host.askAgent) && 'flex-1 justify-center'"
      >
        <span class="truncate">{{ place ? `Open ${place}` : 'Open' }}</span>
      </UButton>
      <UButton
        v-if="last && draft.conversationId && host.askAgent"
        icon="i-lucide-wand-sparkles"
        color="neutral"
        size="lg"
        class="min-h-12 flex-1 shrink-0 justify-center px-4 whitespace-nowrap"
        :loading="asking"
        aria-label="Ask agent to draft a reply"
        @click="askReply"
      >
        <span class="sm:hidden">Draft a reply</span><span class="hidden sm:inline">Ask agent to draft a reply</span>
      </UButton>
    </div>
  </div>
</template>
