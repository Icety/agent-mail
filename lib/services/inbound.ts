import type { InboundRepo, MailLinks, MailOwner } from '../ports'
import type { InboundRow, AddressRow } from '../rows'
import { addressWire, inboundWire } from '../wire'
import type { AddressKind, IncomingMail, InboundView, MailAddress, MailAuthorization, MailDraft, MailNeed, MailSlip, MailTopicMap } from '../../shared/types'
import type { OpenMailClient, OpenMailMessage } from './openmail'
import type { MailForModel, MailReader } from './reader'
import { sanitizeLine, sanitizeMail } from './sanitize'

// Inbound mail from OpenMail: store once, classify with the tool-less reader, tell the owner in the
// chat of the agent that owns the address. Noise (DMARC reports, newsletters, bounces) stays out
// of the inbox, under Low priority, and waits for the daily digest. A mail is done when the owner
// closes it, when their reply to it is sent, or when an agent closes it. Nothing here sends mail or
// hands mail content to an agent session; replies are drafts the owner sends.

export class InboundError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message) }
}

export interface InboundDeps {
  repo: InboundRepo
  client: Pick<OpenMailClient, 'listInboxes' | 'unreadThreads' | 'threadMessages' | 'rawHeaders' | 'markThreadRead'>
  reader: MailReader
  now: () => Date
  owner: MailOwner
  assistantName: string
  links: MailLinks
  // The owner's own address: the only sender whose instructions the intake address follows.
  ownerAddress: string
  digestHour: number
  timeZone: string
  agents: () => Promise<{ id: string, name: string }[]>
  // Posts a message in the agent's main chat (null: the always-on assistant) and pushes it.
  notify: (agentId: string | null, text: string) => Promise<{ conversationId: string }>
  getState: (key: string) => Promise<string | undefined>
  setState: (key: string, value: string) => Promise<void>
  createReplyDraft: (input: { conversationId: string, from: string, senderName: string, to: string, subject: string, body: string, inboundId: string, contextLabel: string }) => Promise<MailDraft>
  reviseReplyDraft: (draftId: string, baseRevision: number, reply: { subject: string, body: string }) => Promise<unknown>
  stopRevise: (draftId: string, error: string) => Promise<void>
  publish: <K extends keyof MailTopicMap>(topic: K, data: MailTopicMap[K]) => void
  // For the agent routes: whose chat a call comes from, and the host's authorize hook.
  conversation: (id: string) => Promise<{ agentId: string } | undefined>
  authorize: (ctx: MailAuthorization) => Promise<void>
}

// Who an internal call acts as: the agent named, or the owner of the chat it works in.
export interface AgentScope {
  agent?: string
  conversation?: string
}

const FORWARD_MARKER = /^[ \t>]*(?:-{2,}\s*(?:Forwarded message|Doorgestuurd bericht|Original Message|Oorspronkelijk bericht)\s*-{2,}|Begin forwarded message:|Begin doorgestuurd bericht:)[ \t]*$/im

const emailOf = (value: string): string => (value.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? value).trim().toLowerCase()
const domainOf = (address: string): string => address.split('@')[1] ?? address
const squash = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '')

// Markdown in a chat message must not turn sender-controlled text into links or images.
const escapeMd = (value: string): string => value.replace(/[\\`*_{}[\]()<>#+\-.!|~]/g, '\\$&')
const md = (value: string): string => escapeMd(value).replace(/\s+/g, ' ').trim()
// Same, for model text with paragraphs: keeps line breaks as hard breaks.
const mdLines = (value: string): string => value.trim().split(/\n/).map(line => escapeMd(line.trim())).join('  \n')

// DMARC aggregate reports, wherever they land: "Report domain: x Submitter: google.com ..." from a
// dmarc mailbox. Decided here, not by the model.
const isDmarcReport = (row: Pick<InboundRow, 'subject' | 'fromAddress'>): boolean =>
  /^(\[preview\] )?report domain:/i.test(row.subject) || /dmarc/i.test(row.fromAddress.split('@')[0] ?? '')

const guessKind = (address: string, ownerAddress: string): AddressKind => {
  const local = address.split('@')[0] ?? ''
  if (local === ownerAddress.split('@')[0]?.toLowerCase()) return 'owner'
  if (['dmarc', 'postmaster', 'reports'].includes(local)) return 'reports'
  if (['in', 'intake', 'inbox'].includes(local)) return 'intake'
  return 'project'
}

// Trusts the intake mail only when SES, the receiving server, recorded DMARC pass for the owner's
// domain and the From is the owner's address. The topmost Authentication-Results is SES's own;
// copies further down were written by the sender and prove nothing.
export const fromOwner = (headers: string, owner: string): boolean => {
  const lines = headers.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)
  const results = lines.find(line => /^authentication-results:/i.test(line))
  const ownerDomain = domainOf(owner).replace(/\./g, '\\.')
  if (!results || !/^authentication-results:\s*amazonses\.com\s*;/i.test(results)) return false
  if (!new RegExp(`(^|;)\\s*dmarc=pass\\b[^;]*\\bheader\\.from=${ownerDomain}\\s*(;|$)`, 'i').test(results.replace(/^[^;]*;/, ';'))) return false
  const from = lines.filter(line => /^from:/i.test(line))
  return from.length === 1 && emailOf(from[0]!.replace(/^from:/i, '')) === owner.toLowerCase()
}

const localDay = (at: Date, timeZone: string): { day: string, hour: number } => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(at).map(p => [p.type, p.value]))
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) }
}

export const createInboundService = (deps: InboundDeps) => {
  const { repo, now } = deps
  const { owner, assistantName, links } = deps
  const audit = (kind: string, ref: string | null, detail: Record<string, unknown> = {}): Promise<void> => repo.audit(kind, ref, detail, now())
  const changed = (row: InboundRow): void => {
    deps.publish('mail.inbound', { inboundId: row.id })
    deps.publish('mail.summary', {})
  }

  const syncAddresses = async (): Promise<AddressRow[]> => {
    const agents = await deps.agents()
    for (const inbox of await deps.client.listInboxes()) {
      const address = inbox.address.toLowerCase()
      const known = await repo.getAddress(inbox.id)
      const kind = known?.kind ?? guessKind(address, deps.ownerAddress)
      const label = squash(domainOf(address).split('.')[0] ?? '')
      // A project agent named like the domain (Acme for acme.example) owns its addresses.
      const agentId = known ? known.agentId : (kind === 'intake' || kind === 'reports' ? null : agents.find(a => squash(a.name) === label)?.id ?? null)
      await repo.upsertAddress({ id: inbox.id, address, displayName: inbox.displayName, kind, agentId, createdAt: known?.createdAt ?? now(), updatedAt: now() })
      if (!known) await audit('address_added', inbox.id, { address, kind, agentId })
    }
    return repo.listAddresses()
  }

  const store = async (message: OpenMailMessage, inboxId: string, address: AddressRow): Promise<InboundRow | undefined> => {
    const fromAddress = emailOf(message.fromAddr)
    const row = await repo.insertInbound({
      id: crypto.randomUUID(), openmailMessageId: message.id, threadId: message.threadId, addressId: inboxId,
      toAddress: address.address, fromAddress, fromName: sanitizeLine(message.addressNames?.[fromAddress] ?? ''),
      subject: sanitizeLine(message.subject ?? '', 500) || '(no subject)',
      body: sanitizeMail({ html: message.bodyHtml, text: message.bodyText }),
      attachments: (message.attachments ?? []).map(a => ({ filename: sanitizeLine(a.filename, 200), contentType: a.contentType ?? '', sizeBytes: a.sizeBytes })),
      receivedAt: new Date(message.createdAt), status: 'received', category: null, summary: null, suggestedAction: null,
      trusted: false, conversationId: null, digestedAt: null, createdAt: now(), updatedAt: now(),
    })
    if (row) await audit('inbound_received', row.id, { openmailMessageId: message.id, to: row.toAddress, from: row.fromAddress, subject: row.subject })
    return row
  }

  const forModel = (row: InboundRow): MailForModel => ({ domain: domainOf(row.toAddress), address: row.toAddress, fromAddress: row.fromAddress,
    fromName: row.fromName, subject: row.subject, attachments: row.attachments, body: row.body })

  const notice = (row: InboundRow, heading: string, lines: string[]): string => [
    `**${heading}** · ${md(domainOf(row.toAddress))}`,
    `From: ${md(row.fromName ? `${row.fromName} <${row.fromAddress}>` : row.fromAddress)}`,
    `Subject: ${md(row.subject)}`,
    ...lines,
    `[Open mail](${links.inbound(row.id)})`,
  ].join('\n\n')

  const handleIntake = async (row: InboundRow): Promise<InboundRow | undefined> => {
    const headers = await deps.client.rawHeaders(row.openmailMessageId).catch(() => '')
    const trusted = row.fromAddress === deps.ownerAddress.toLowerCase() && fromOwner(headers, deps.ownerAddress)
    await audit('intake_checked', row.id, { trusted })
    if (!trusted) return undefined
    const marker = row.body.search(FORWARD_MARKER)
    const instruction = marker === -1 ? row.body : row.body.slice(0, marker).trim()
    const forwarded = marker === -1 ? '' : row.body.slice(marker)
    const result = await deps.reader.intake({ instruction, forwarded, subject: row.subject })
      .catch(error => ({ reply: `${assistantName} could not process this forward (${error instanceof Error ? error.message.slice(0, 120) : 'error'}). Open it to read it.` }))
    const { conversationId } = await deps.notify(null, notice(row, 'You forwarded a mail', [mdLines(result.reply)]))
    return repo.updateInbound(row.id, { category: 'intake', trusted: true, summary: result.reply.slice(0, 2_000), conversationId, status: 'handled', updatedAt: now() })
  }

  const handle = async (row: InboundRow): Promise<void> => {
    const address = await repo.getAddress(row.addressId)
    const kind = address?.kind ?? 'project'
    let done: InboundRow | undefined
    if (kind === 'intake') done = await handleIntake(row)
    if (!done) {
      const result = kind === 'reports' || isDmarcReport(row)
        ? { category: 'noise' as const, summary: 'DMARC report', suggestedAction: 'Nothing to do' }
        : await deps.reader.classify(forModel(row), kind).catch(async error => {
          await audit('classify_failed', row.id, { error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' })
          return { category: 'project' as const, summary: `${assistantName} could not summarize this mail. Open it to read it.`, suggestedAction: 'Read it yourself' }
        })
      // Personal addresses: everything is for the owner, except what the reader calls noise
      // (marketing, bounces, receipts); that goes to Low priority and the digest like anywhere else.
      const category = kind === 'intake' || (kind === 'owner' && result.category !== 'noise') ? 'owner' : result.category
      await audit('classified', row.id, { category, model: result.category, kind })
      let conversationId: string | null = null
      if (category !== 'noise') {
        const heading = kind === 'intake' ? 'Mail on your intake address, NOT verified as yours' : category === 'owner' ? `New mail for ${owner.name}` : 'New mail'
        conversationId = (await deps.notify(address?.agentId ?? null, notice(row, heading, [md(result.summary), `Suggested: ${md(result.suggestedAction)}`]))).conversationId
        await audit('notified', row.id, { conversationId })
      }
      done = await repo.updateInbound(row.id, { category, summary: result.summary, suggestedAction: result.suggestedAction, conversationId, status: 'handled', updatedAt: now() })
    }
    if (done) changed(done)
  }

  // One queue: WebSocket events and the poll never handle mail at the same time.
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work)
    queue = next.catch(() => {})
    return next
  }

  const processThread = (threadId: string, inboxId: string): Promise<void> => serial(async () => {
    let address = await repo.getAddress(inboxId)
    if (!address) address = (await syncAddresses()).find(a => a.id === inboxId)
    if (!address) throw new Error(`OpenMail inbox ${inboxId} is not in this app's pod`)
    const messages = (await deps.client.threadMessages(threadId)).filter(m => m.direction === 'inbound')
    const known = await repo.knownMessageIds(messages.map(m => m.id))
    for (const message of messages.filter(m => !known.has(m.id))) await store(message, inboxId, address)
    // Stored is durable: mark read now; handling resumes from the database if it fails below.
    await deps.client.markThreadRead(threadId)
    for (const row of await repo.unhandled()) await handle(row)
  })

  const catchUp = async (): Promise<void> => {
    for (const address of await syncAddresses()) {
      for (const thread of await deps.client.unreadThreads(address.id)) await processThread(thread.id, address.id)
    }
    await serial(async () => { for (const row of await repo.unhandled()) await handle(row) })
  }

  const maybeDigest = async (): Promise<void> => {
    const { day, hour } = localDay(now(), deps.timeZone)
    if (hour < deps.digestHour || await deps.getState('digest:lastDay') === day) return
    const rows = await repo.undigestedNoise()
    await deps.setState('digest:lastDay', day)
    if (!rows.length) return
    const lines = rows.map(row => `- ${md(domainOf(row.toAddress))} · ${md(row.fromName || row.fromAddress)} · ${md(row.subject)}`)
    await deps.notify(null, [`**Mail digest** · ${rows.length} low-priority ${rows.length === 1 ? 'mail' : 'mails'}`, lines.join('\n'), `[Open the mail inbox](${links.inbox})`].join('\n\n'))
    for (const row of rows) await repo.updateInbound(row.id, { digestedAt: now() })
    await audit('digest_sent', null, { count: rows.length })
  }

  const requireInbound = async (id: string): Promise<InboundRow> => {
    const row = await repo.getInbound(id)
    if (!row) throw new InboundError(404, 'Mail not found')
    return row
  }

  // The owner asks for a reply. The reader writes it; it becomes a normal draft they review and send.
  const draftReply = async (id: string, instruction: string): Promise<MailDraft> => {
    const row = await requireInbound(id)
    const address = await repo.getAddress(row.addressId)
    if (!address || address.kind === 'intake' || address.kind === 'reports') throw new InboundError(409, `Replies go out from project addresses only. For forwarded mail, ${assistantName} gives you text to send yourself`)
    const senderName = address.displayName || address.address
    const reply = await deps.reader.draftReply({ mail: forModel(row), senderName, instruction })
      .catch(error => { throw new InboundError(502, `${assistantName} could not write the reply: ${error instanceof Error ? error.message.slice(0, 160) : 'error'}`) })
    const conversationId = row.conversationId ?? (await deps.notify(address.agentId, `Drafting a reply to ${md(row.fromAddress)}: ${md(row.subject)}`)).conversationId
    const draft = await deps.createReplyDraft({ conversationId, from: address.address, senderName, to: row.fromAddress,
      subject: reply.subject, body: reply.body, inboundId: row.id, contextLabel: `Reply · ${domainOf(address.address)}` })
    await audit('draft_created', draft.id, { inboundId: row.id, instruction })
    changed(await repo.updateInbound(row.id, { conversationId, updatedAt: now() }) ?? row)
    return draft
  }

  // Revise on a reply draft: rewritten here with the tool-less reader, never by an agent session.
  const redraft = async (draft: MailDraft, note: string): Promise<void> => {
    try {
      const row = await requireInbound(draft.inboundId ?? '')
      const address = await repo.getAddress(row.addressId)
      const reply = await deps.reader.draftReply({ mail: forModel(row), senderName: address?.displayName || draft.from, instruction: note,
        previous: { subject: draft.subject, body: draft.body } })
      await deps.reviseReplyDraft(draft.id, draft.revision, reply)
      await audit('draft_revised', draft.id, { inboundId: row.id, note })
    }
    catch (error) {
      await deps.stopRevise(draft.id, `Could not rewrite the draft: ${error instanceof Error ? error.message.slice(0, 160) : 'error'}`)
    }
  }

  // `detail` says who closed it when it was not the owner in the app. Already done: nothing changes
  // and no second audit line.
  const markDone = async (id: string, detail: Record<string, unknown> = {}): Promise<IncomingMail> => {
    const current = await requireInbound(id)
    if (current.status === 'done') return inboundWire(current, await repo.draftsFor(id))
    const row = await repo.updateInbound(id, { status: 'done', updatedAt: now() })
    if (!row) throw new InboundError(404, 'Mail not found')
    await audit('inbound_done', id, detail)
    changed(row)
    return inboundWire(row, await repo.draftsFor(id))
  }

  // The owner's reply to a mail went out (or they marked the draft sent): the mail is done.
  const replied = async (inboundId: string, draftId: string): Promise<void> => {
    if (!await repo.getInbound(inboundId)) return
    await markDone(inboundId, { by: 'reply', draftId })
  }

  const agentFor = async (scope: AgentScope): Promise<string> => {
    if (!scope.agent && !scope.conversation) throw new InboundError(400, 'An agent or conversation is required')
    const conversation = scope.conversation ? await deps.conversation(scope.conversation) : undefined
    if (scope.conversation && !conversation) throw new InboundError(404, 'Conversation not found')
    if (scope.agent && conversation && scope.agent !== conversation.agentId) throw new InboundError(400, 'Agent does not own this conversation')
    const agentId = conversation?.agentId ?? scope.agent
    if (!agentId) throw new InboundError(400, 'An agent or conversation is required')
    return agentId
  }
  const authorized = async (scope: AgentScope, action: MailAuthorization['action']): Promise<string> => {
    const ctx: MailAuthorization = { agentId: await agentFor(scope), action, allowed: true }
    await deps.authorize(ctx)
    if (!ctx.allowed) throw new InboundError(403, 'Mail is turned off for this agent')
    return ctx.agentId
  }
  const wire = (rows: InboundRow[]): Promise<IncomingMail[]> => Promise.all(rows.map(async row => inboundWire(row, await repo.draftsFor(row.id))))

  return {
    syncAddresses, processThread, catchUp, maybeDigest, draftReply, redraft, markDone, replied,
    list: async (view: InboundView): Promise<IncomingMail[]> => wire(await repo.listInbound({ view })),
    get: async (id: string): Promise<IncomingMail> => inboundWire(await requireInbound(id), await repo.draftsFor(id)),
    // Agents (internal token) read the inbox and close mail, audited as theirs. Nothing else.
    agentList: async (scope: AgentScope, opts: { view: InboundView, from?: string }): Promise<IncomingMail[]> => {
      await authorized(scope, 'readInbox')
      return wire(await repo.listInbound(opts))
    },
    agentMarkDone: async (id: string, scope: AgentScope): Promise<IncomingMail> => {
      const agentId = await authorized(scope, 'doneInbound')
      return markDone(id, { by: 'agent', agentId })
    },
    addresses: async (): Promise<MailAddress[]> => (await repo.listAddresses()).map(addressWire),
    patchAddress: async (id: string, values: { kind?: AddressKind, agentId?: string | null }): Promise<MailAddress> => {
      const row = await repo.patchAddress(id, values, now())
      if (!row) throw new InboundError(404, 'Address not found')
      await audit('address_changed', id, values)
      return addressWire(row)
    },
    // The home screen: mail the owner has not answered or finished as "needs you" (count goes on the
    // Mail badge), and one slip into the inbox that is always there.
    home: async (): Promise<{ count: number, needs: MailNeed[], slip: MailSlip }> => {
      const inbox = await wire(await repo.listInbound({ view: 'inbox' }))
      const waiting = inbox.filter(mail => mail.status === 'handled' && !mail.drafts.length)
      const noise = (await repo.listInbound({ view: 'noise' })).length
      const latest = inbox[0]
      return {
        count: waiting.length,
        needs: waiting.slice(0, 5).map(mail => ({
          id: `inbound:${mail.id}`, tone: 'mail', icon: 'i-lucide-inbox',
          title: `${mail.category === 'owner' ? 'Mail for you' : 'New mail'} from ${mail.fromName || mail.fromAddress}`,
          detail: mail.subject, action: { label: 'Open', to: links.inbound(mail.id) },
        })),
        slip: {
          tone: 'mail', icon: 'i-lucide-inbox', label: 'Mail', to: links.inbox,
          title: inbox.length ? `${inbox.length} in your inbox` : 'Inbox clear',
          meta: latest ? `Latest from ${latest.fromName || latest.fromAddress}` : 'Nothing waiting for you',
          badges: noise ? [{ label: `${noise} low priority`, tone: 'neutral' }] : [],
        },
      }
    },
  }
}
export type InboundService = ReturnType<typeof createInboundService>
