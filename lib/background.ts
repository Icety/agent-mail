import type { MailStack } from './stack'
import { startOpenMailListener } from './services/openmail-ws'

export interface MailBackgroundOptions {
  // Resolved on the first run, so opening the store happens after boot and its failure is logged.
  stack: () => MailStack
  // IMAP reply polling (createImapPoller), when configured.
  pollImap?: () => Promise<void>
  // OpenMail live events, when configured.
  openmail?: { wsUrl: string, apiKey: string }
  report?: (error: unknown) => void
}

// Never log connection credentials.
const scrub = (error: unknown): string => error instanceof Error
  ? error.message.replace(/\b(?:smtps?|imaps?):\/\/\S+/gi, '[mail server]').replace(/om_[A-Za-z0-9_-]+/g, '[key]')
  : 'Unknown error'

// The send scheduler (every second), reply polling (30 s), OpenMail events with a catch-up poll
// on every connect and every 5 minutes, and the daily digest check (10 min). Mail failures are
// logged and never thrown, so they cannot take the host app down. Returns stop.
export const startMailBackground = (opts: MailBackgroundOptions): { stop: () => void } => {
  const report = opts.report ?? ((error: unknown) => console.error('[mail] background task failed', scrub(error)))
  let stopping = false
  const guarded = (work: () => Promise<void>) => {
    let running = false
    return async (): Promise<void> => {
      if (stopping || running) return
      running = true
      try { await work() }
      catch (error) { report(error) }
      finally { running = false }
    }
  }
  const send = guarded(() => opts.stack().mail.tick())
  const inbox = guarded(async () => {
    await opts.stack().mail.notifyReplies()
    await opts.pollImap?.()
  })
  const catchUp = guarded(async () => { await opts.stack().inbound?.catchUp() })
  const digest = guarded(async () => { await opts.stack().inbound?.maybeDigest() })

  let listener: { stop: () => void } | undefined
  const first = setTimeout(() => {
    void (async () => {
      let inbound: MailStack['inbound']
      try {
        const stack = opts.stack()
        await stack.mail.recover()
        inbound = stack.inbound
      }
      catch (error) {
        report(error)
        return
      }
      void send()
      void inbox()
      if (!inbound || !opts.openmail || stopping) return
      listener = startOpenMailListener({
        url: opts.openmail.wsUrl, apiKey: opts.openmail.apiKey,
        onMessage: event => inbound.processThread(event.thread_id, event.inbox_id),
        onConnected: () => { void catchUp() },
        report: (what, error) => report(error ?? new Error(what)),
      })
    })()
  }, 1000)
  const timers = [
    setInterval(() => { void send() }, 1000),
    setInterval(() => { void inbox() }, 30_000),
    setInterval(() => { void catchUp() }, 5 * 60_000),
    setInterval(() => { void digest() }, 10 * 60_000),
  ]
  return {
    stop: () => {
      stopping = true
      listener?.stop()
      clearTimeout(first)
      for (const timer of timers) clearInterval(timer)
    },
  }
}
