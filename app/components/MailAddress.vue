<script setup lang="ts">
// An email address that may wrap after the @ on a narrow screen, never in the middle of a word.
const props = defineProps<{ address: string }>()
const at = computed(() => props.address.lastIndexOf('@'))
</script>

<template>
  <span class="inline-block max-w-full break-words"><template v-if="at > 0">{{ props.address.slice(0, at) }}@<wbr>{{ props.address.slice(at + 1) }}</template><template v-else>{{ props.address }}</template></span>
</template>
