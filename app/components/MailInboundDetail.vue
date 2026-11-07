<script setup lang="ts">
import type { IncomingMail, MailDraft } from '../../shared/types'
import { categoryPill, domainOf } from '../utils/inboundView'
import { mailErrorMessage } from '../utils/mailApi'

// One inbound mail as plain text (links are not clickable, attachments are not opened), and the
// only way to answer it: the reader drafts a reply from the owner's instruction, the owner reviews and sends.
// `back`: where the page header's back button goes (phone); on a desktop the list sits next to it.
const props = withDefaults(defineProps<{ id: string, back?: string, aside?: boolean }>(), { back: '/mail/inbox', aside: false })

const id = computed(() => props.id)
const { data: mail, error, refresh } = await useFetch<IncomingMail>(() => `/api/mail/inbound/${encodeURIComponent(id.value)}`)
const host = useMailClientHost()
useHead({ title: computed(() => `${mail.value?.subject ?? 'Mail'} · ${host.appName}`) })
useMailLive('mail.inbound', data => { if (!data || data.inboundId === id.value) void refresh() })

const canReply = computed(() => mail.value?.category !== 'intake' && mail.value?.category !== 'noise')
const instruction = ref('')
const drafting = ref(false)
const toast = useToast()
const draft = async () => {
  drafting.value = true
  try {
    const created = await $fetch<MailDraft>(`/api/mail/inbound/${encodeURIComponent(id.value)}/draft`, { method: 'POST', body: { instruction: instruction.value } })
    instruction.value = ''
    await navigateTo(`/mail?draft=${encodeURIComponent(created.id)}`)
  }
  catch (err) {
    toast.add({ title: mailErrorMessage(err), color: 'error' })
  }
  finally {
    drafting.value = false
  }
}
const finishing = ref(false)
const done = async () => {
  finishing.value = true
  try {
    await $fetch(`/api/mail/inbound/${encodeURIComponent(id.value)}/done`, { method: 'POST' })
    await navigateTo(props.back)
  }
  catch (err) {
    toast.add({ title: mailErrorMessage(err), color: 'error' })
  }
  finally {
    finishing.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 sm:pt-8" :class="props.aside && 'lg:mx-0 lg:max-w-3xl lg:px-8'">
    <MailPageHeader
      :title="mail?.subject ?? 'Mail'"
      :subtitle="mail ? `${domainOf(mail.toAddress)} · ${formatMailTime(mail.receivedAt, 'relative')}` : undefined"
      :back="props.aside ? undefined : props.back"
      :phone-back="props.aside ? props.back : undefined"
      class="mb-5"
    >
      <template v-if="mail && mail.status !== 'done'" #actions>
        <UButton label="Mark done" icon="i-lucide-check" color="neutral" variant="outline" class="min-h-11 max-lg:hidden" :loading="finishing" @click="done" />
      </template>
    </MailPageHeader>

    <MailLoadError v-if="error" title="This mail did not load" :detail="mailErrorMessage(error)" @retry="refresh()" />
    <template v-else-if="mail">
      <section class="rounded-mail-card bg-mail-card p-4 shadow-mail-lift">
        <div class="flex flex-wrap items-center gap-2">
          <MailStatusPill v-bind="categoryPill(mail)" />
          <span class="min-w-0 break-all text-sm text-mail-ink-3">to {{ mail.toAddress }}</span>
        </div>
        <p class="mt-3 break-words font-medium">{{ mail.fromName ? `${mail.fromName} <${mail.fromAddress}>` : mail.fromAddress }}</p>
        <p v-if="mail.summary" class="mt-3 whitespace-pre-wrap break-words text-sm">{{ mail.summary }}</p>
        <p v-if="mail.suggestedAction && mail.category !== 'intake'" class="mt-2 text-sm text-mail-ink-3">Suggested: {{ mail.suggestedAction }}</p>
        <p v-if="mail.category === 'intake' && !mail.trusted" class="mt-2 text-sm text-mail-warn-deep">
          This came to your intake address but is not verified as sent by you, so {{ host.appName }} did not follow any instruction in it.
        </p>
      </section>

      <section v-if="canReply && mail.status !== 'done'" class="mt-4 rounded-mail-card bg-mail-card p-4 shadow-mail-lift">
        <label for="reply-instruction" class="text-sm font-medium">What should the reply say?</label>
        <UTextarea
          id="reply-instruction" v-model="instruction" :rows="3" autoresize class="mt-2 w-full"
          placeholder="For example: thank her, say we will look at it next week"
        />
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <UButton label="Draft reply" icon="i-lucide-pen-line" color="neutral" class="min-h-11" :loading="drafting" @click="draft" />
          <span class="text-xs text-mail-ink-3">Nothing is sent until you press Send on the draft.</span>
        </div>
        <div v-if="mail.drafts.length" class="mt-3 flex flex-wrap gap-2">
          <UButton
            v-for="(d, i) in mail.drafts" :key="d.id" :to="`/mail?${d.state === 'sent' ? 'thread' : 'draft'}=${encodeURIComponent(d.id)}`"
            :label="`Draft ${i + 1} (${d.state})`" color="neutral" variant="outline" size="sm"
          />
        </div>
      </section>

      <section class="mt-4 rounded-mail-card bg-mail-card p-4 shadow-mail-lift">
        <h2 class="text-sm font-medium text-mail-ink-3">The mail, as plain text</h2>
        <p class="mt-2 whitespace-pre-wrap break-words text-sm">{{ mail.body || '(empty)' }}</p>
        <div v-if="mail.attachments.length" class="mt-4 border-t border-mail-line pt-3 text-sm">
          <p class="text-mail-ink-3">Attachments (not opened by {{ host.appName }}):</p>
          <p v-for="a in mail.attachments" :key="a.filename" class="break-all">{{ a.filename }} · {{ Math.ceil(a.sizeBytes / 1024) }} KB</p>
        </div>
      </section>

      <div v-if="mail.status !== 'done'" class="mt-4" :class="props.aside && 'lg:hidden'">
        <UButton label="Mark done" icon="i-lucide-check" color="neutral" variant="outline" class="min-h-11" :loading="finishing" @click="done" />
      </div>
    </template>
  </div>
</template>
