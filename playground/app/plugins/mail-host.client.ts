export default defineNuxtPlugin(() => ({
  provide: {
    mailHost: defineMailClientHost({
      appName: 'Playground',
      assistantLabel: 'Assistant',
      agents: ref([{ id: 'agent-1', name: 'Agent one' }]),
    }),
  },
}))
