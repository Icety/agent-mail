import type { Ref } from 'vue'
import type { MailTopicMap } from '../../shared/types'

// What the host app tells the mail screens. Provide it from a client plugin in the host:
//
//   export default defineNuxtPlugin(() => ({ provide: { mailHost: defineMailClientHost({ ... }) } }))
//
// Everything is optional. Without `live` the screens refresh every 30 seconds instead.
export interface MailClientHost {
  // Page titles: "Mail · <appName>".
  appName: string
  // The always-on assistant in the address owner picker: "Koopa (main assistant)" in Koopa.
  assistantLabel: string
  // Subscribe to a live topic; returns unsubscribe. Called with undefined after a reconnect.
  live?: <K extends keyof MailTopicMap>(topic: K, handler: (data: MailTopicMap[K] | undefined) => void) => () => void
  // Agents that can own an inbound address.
  agents?: Ref<readonly { id: string, name: string }[]>
  // A conversation's title for the Mail page subtitle.
  conversationTitle?: (conversationId: string) => string | undefined
  // Posts the owner's message in a conversation ("Draft a reply to ..."). Without it the button is hidden.
  askAgent?: (conversationId: string, text: string) => Promise<void>
}

const DEFAULT_HOST: MailClientHost = { appName: 'Mail', assistantLabel: 'Main assistant' }

export const defineMailClientHost = (host: Partial<MailClientHost>): MailClientHost => ({ ...DEFAULT_HOST, ...host })

export const useMailClientHost = (): MailClientHost => (useNuxtApp().$mailHost as MailClientHost | undefined) ?? DEFAULT_HOST

// Live updates for one topic while the calling scope lives: the host's channel, or a 30 s poll.
export const useMailLive = <K extends keyof MailTopicMap>(topic: K, handler: (data: MailTopicMap[K] | undefined) => void): void => {
  const host = useMailClientHost()
  if (import.meta.server) return
  const off = host.live
    ? host.live(topic, handler)
    : (() => {
        const timer = setInterval(() => handler(undefined), 30_000)
        return () => clearInterval(timer)
      })()
  if (getCurrentScope()) onScopeDispose(off)
}
