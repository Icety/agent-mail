<script setup lang="ts">
// One inbound mail. Desktop: the inbox's lists on the left, the mail on the right. Phone: the mail alone.
definePageMeta({ hideTabBar: true })
const route = useRoute()
const id = computed(() => String(route.params.id))
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <aside class="hidden w-[360px] shrink-0 border-r border-mail-line lg:block">
      <MailInboxList />
    </aside>
    <div class="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <MailInboundDetail :key="id" :id="id" back="/mail/inbox" aside />
    </div>
  </div>
</template>
