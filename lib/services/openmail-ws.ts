// Keeps one WebSocket open to OpenMail and hands every message.received event to onMessage.
// Outbound only, so the tailnet-only app needs no public webhook. Missed events are not replayed
// here: every (re)connect calls onConnected, which polls the unread threads instead.

export interface OpenMailEvent {
  event: string
  event_id: string
  inbox_id: string
  thread_id: string
}

export const startOpenMailListener = (opts: {
  url: string
  apiKey: string
  onMessage: (event: OpenMailEvent) => Promise<void>
  onConnected: () => void
  report: (what: string, error?: unknown) => void
}): { stop: () => void } => {
  let socket: WebSocket | undefined
  let stopped = false
  let delay = 1_000
  let retry: ReturnType<typeof setTimeout> | undefined

  const connect = (): void => {
    if (stopped) return
    // Bun's WebSocket accepts headers; the token never goes into a URL.
    const ws = new WebSocket(opts.url, { headers: { Authorization: `Bearer ${opts.apiKey}` } } as unknown as string[])
    socket = ws
    ws.onopen = () => {
      delay = 1_000
      ws.send(JSON.stringify({ type: 'subscribe', event_types: ['message.received'] }))
    }
    ws.onmessage = msg => {
      let data: { type?: string, event?: string, message?: string } & Partial<OpenMailEvent>
      try { data = JSON.parse(String(msg.data)) }
      catch { return }
      if (data.type === 'subscribed') return opts.onConnected()
      if (data.type === 'error') return opts.report(`OpenMail WebSocket error: ${String(data.message ?? '').slice(0, 200)}`)
      if (data.event === 'message.received' && data.inbox_id && data.thread_id) {
        opts.onMessage(data as OpenMailEvent).catch(error => opts.report('Handling an OpenMail event failed', error))
      }
    }
    ws.onclose = event => {
      if (stopped) return
      if (event.code === 4001) opts.report('OpenMail refused the API key (4001). Check NUXT_MAIL_OPENMAIL_API_KEY')
      retry = setTimeout(connect, delay)
      delay = Math.min(delay * 2, 30_000)
    }
    ws.onerror = () => { /* onclose follows and reconnects */ }
  }
  connect()
  return {
    stop: () => {
      stopped = true
      clearTimeout(retry)
      socket?.close()
    },
  }
}
