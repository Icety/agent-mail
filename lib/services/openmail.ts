// Thin OpenMail REST client (https://docs.openmail.sh). Runs with a pod key: it sees only
// that pod's inboxes, can add allow rules there, and cannot loosen a policy or change inboxes.

export interface OpenMailInbox {
  id: string
  address: string
  displayName: string | null
}
export interface OpenMailAttachment {
  filename: string
  contentType?: string
  sizeBytes: number
}
export interface OpenMailMessage {
  id: string
  threadId: string
  direction: 'inbound' | 'outbound'
  fromAddr: string
  toAddr: string
  subject: string
  bodyText: string | null
  bodyHtml: string | null
  // Display names from the sender's mail client, keyed by lower-cased address.
  addressNames?: Record<string, string> | null
  attachments: OpenMailAttachment[]
  createdAt: string
}
export interface OpenMailSend {
  to: string
  cc: string[]
  subject: string
  body: string
  threadId?: string
  idempotencyKey?: string
}

export class OpenMailError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message) }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export const createOpenMailClient = (opts: { apiKey: string, baseUrl: string, podId: string, fetch?: Fetch }) => {
  const doFetch = opts.fetch ?? fetch
  const request = async <T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> => {
    const res = await doFetch(`${opts.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${opts.apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    })
    if (res.status === 204) return undefined as T
    const text = await res.text()
    if (!res.ok) {
      const data = (() => { try { return JSON.parse(text) as { error?: string, message?: string } } catch { return {} } })()
      throw new OpenMailError(res.status, data.error ?? 'http_error', data.message ?? `OpenMail answered ${res.status} on ${method} ${path}`)
    }
    return (text ? JSON.parse(text) : undefined) as T
  }
  const id = encodeURIComponent
  return {
    listInboxes: async (): Promise<OpenMailInbox[]> =>
      (await request<{ data: OpenMailInbox[] }>('GET', '/v1/inboxes?limit=100')).data,
    unreadThreads: async (inboxId: string): Promise<{ id: string }[]> =>
      (await request<{ data: { id: string }[] }>('GET', `/v1/inboxes/${id(inboxId)}/threads?isRead=false&limit=100`)).data,
    threadMessages: async (threadId: string): Promise<OpenMailMessage[]> => {
      const res = await request<OpenMailMessage[] | { data: OpenMailMessage[] }>('GET', `/v1/threads/${id(threadId)}/messages`)
      return Array.isArray(res) ? res : res.data
    },
    rawHeaders: async (messageId: string): Promise<string> => {
      const res = await doFetch(`${opts.baseUrl}/v1/messages/${id(messageId)}/raw`, {
        headers: { Authorization: `Bearer ${opts.apiKey}` }, signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) throw new OpenMailError(res.status, 'raw_unavailable', `OpenMail answered ${res.status} for the raw message`)
      const raw = await res.text()
      const end = raw.search(/\r?\n\r?\n/)
      return end === -1 ? raw : raw.slice(0, end)
    },
    markThreadRead: (threadId: string): Promise<unknown> => request('PATCH', `/v1/threads/${id(threadId)}`, { isRead: true }),
    allowOutbound: async (value: string): Promise<void> => {
      try { await request('POST', `/v1/policy/rules?podId=${id(opts.podId)}`, { type: 'allow', direction: 'outbound', value }) }
      catch (error) {
        // Already allowed is fine.
        if (error instanceof OpenMailError && error.status === 409) return
        throw error
      }
    },
    send: (inboxId: string, mail: OpenMailSend): Promise<{ id: string, threadId: string }> =>
      request('POST', `/v1/inboxes/${id(inboxId)}/send`, {
        to: mail.to, cc: mail.cc.length ? mail.cc : undefined, subject: mail.subject, body: mail.body,
        threadId: mail.threadId, includeQuote: mail.threadId ? true : undefined,
      }, mail.idempotencyKey ? { 'Idempotency-Key': mail.idempotencyKey } : {}),
  }
}
export type OpenMailClient = ReturnType<typeof createOpenMailClient>
