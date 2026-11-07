<script setup lang="ts">
// The inbox. Phone: the lists as a screen. Desktop: the lists in a column on the left and, until a
// mail is opened, an empty pane on the right (an opened mail is /mail/in/:id, with the same column).
definePageMeta({ hideTabBar: true })
const host = useMailClientHost()
useHead({ title: `Inbox · ${host.appName}` })
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <aside class="hidden w-[360px] shrink-0 border-r border-mail-line lg:block">
      <MailInboxList />
    </aside>

    <div class="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 sm:pt-8 lg:hidden">
      <MailPageHeader title="Inbox" subtitle="Mail on your project addresses" back="/" class="mb-4">
        <template #actions>
          <MailDraftsLink />
        </template>
      </MailPageHeader>
      <MailInboxList variant="page" />
    </div>

    <div class="hidden flex-1 items-center justify-center lg:flex">
      <MailEmptyState icon="i-lucide-mail-open" title="Pick a mail" :body="`Open one on the left to read it and have ${host.appName} draft a reply.`">
        <template #action>
          <UButton to="/" color="neutral" variant="outline" label="Back to home" />
        </template>
      </MailEmptyState>
    </div>
  </div>
</template>
