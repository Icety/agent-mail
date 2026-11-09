import { describe, expect, test } from 'bun:test'
import { createMailStack } from '../stack'
import { createLogTransport } from './transports'
import type { OpenMailClient, OpenMailMessage, OpenMailSend } from './openmail'
import type { MailReader } from './reader'
import type { MailAuthorization, MailTransport, OutgoingMail } from '../../shared/types'
import { createFakeHost, storeAdapters } from '../test-support'

const OWNER = 'owner@owner.example'
const SES_PASS = `Return-Path: <x@bounce.owner.example>\nAuthentication-Results: amazonses.com;\n spf=pass smtp.mailfrom=owner.example;\n dkim=pass header.i=@owner.example;\n dmarc=pass header.from=owner.example;\nFrom: Owner Name <${OWNER}>\nSubject: Fwd: Offer`

const message = (id: string, threadId: string, over: Partial<OpenMailMessage> = {}): OpenMailMessage => ({
  id, threadId, direction: 'inbound', fromAddr: 'jane@example.test', toAddr: 'hello@acme.example', subject: `Subject ${id}`,
  bodyText: `Body of ${id}`, bodyHtml: null, attachments: [], createdAt: '2026-10-19T06:00:00.000Z', addressNames: { 'jane@example.test': 'Jane' }, ...over,
})

for (const adapter of storeAdapters) describe(adapter.name, () => {
const setup = async (threads: Record<string, OpenMailMessage[]>, headers: Record<string, string> = {}, authorize: (ctx: MailAuthorization) => Promise<void> = async () => {}, hostTransport?: MailTransport) => {
  // 07:00 in Amsterdam, an hour before the digest.
  let time = Date.parse('2026-10-19T05:00:00Z')
  const fake = createFakeHost([{ id: 'koopa', name: 'Koopa' }, { id: 'leo', name: 'Acme' }])
  const read: string[] = []
  const sends: { inboxId: string, mail: OpenMailSend }[] = []
  const inboxes = { inb_hello: 'hello@acme.example', inb_in: 'in@acme.example', inb_owner: 'owner@acme.example' }
  const client = {
    listInboxes: async () => Object.entries(inboxes).map(([id, address]) => ({ id, address, displayName: 'Acme' })),
    unreadThreads: async (inboxId: keyof typeof inboxes) => Object.keys(threads).filter(t => threads[t]![0]!.toAddr === inboxes[inboxId]).map(id => ({ id })),
    threadMessages: async (threadId: string) => threads[threadId] ?? [],
    rawHeaders: async (id: string) => headers[id] ?? '',
    markThreadRead: async (threadId: string) => { read.push(threadId) },
    allowOutbound: async () => {},
    send: async (inboxId: string, mail: OpenMailSend) => { sends.push({ inboxId, mail }); return { id: `out_${sends.length}`, threadId: mail.threadId ?? 'new' } },
  } as unknown as OpenMailClient
  const intakes: { instruction: string, forwarded: string }[] = []
  const drafted: { instruction: string, previous?: unknown }[] = []
  const classified: string[] = []
  const reader: MailReader = {
    classify: async mail => {
      classified.push(mail.subject)
      if (mail.subject.includes('Broken')) throw new Error('model down')
      return { category: mail.subject.includes('Newsletter') ? 'noise' : 'project', summary: `Summary of ${mail.subject}`, suggestedAction: 'Reply' }
    },
    draftReply: async ({ instruction, previous }) => { drafted.push({ instruction, previous }); return { subject: 'Re: Hi', body: `Reply: ${instruction}` } },
    intake: async input => { intakes.push(input); return { reply: 'Intake answer' } },
  }
  const opened = await adapter.open()
  const stack = createMailStack({
    host: { ...fake.host, authorize }, store: opened.store, now: () => new Date(time), sendDelaySeconds: 10, transport: createLogTransport(),
    openmail: { client, reader, ownerAddress: OWNER, digestHour: 8 }, hostTransport,
  })
  return { stack, inbound: stack.inbound!, read, sends, intakes, drafted, classified, advance: (ms: number) => { time += ms },
    auditLines: opened.auditLines, leoId: 'leo', leoConversation: () => fake.messages.find(m => m.conversationId === 'main:leo')?.conversationId ?? '',
    leoChat: () => fake.chatOf('leo'), assistantChat: () => fake.chatOf(null), systemNotes: () => fake.notes() }
}

test('each mail is handled once, noise waits for one daily digest, and a failing reader still tells the owner', async () => {
  const f = await setup({
    thr_1: [message('msg_1', 'thr_1', { subject: 'Hi ![x](https://t.example/p.png)' })],
    thr_2: [message('msg_2', 'thr_2', { subject: 'Newsletter', fromAddr: 'news@brand.test' })],
    thr_3: [message('msg_3', 'thr_3', { subject: 'Broken' })],
  })
  await f.inbound.processThread('thr_1', 'inb_hello')
  await Promise.all([f.inbound.processThread('thr_1', 'inb_hello'), f.inbound.catchUp()])

  const notices = f.leoChat().map(m => m.text)
  expect(notices).toHaveLength(2)
  expect(notices[0]).toContain('Summary of Hi')
  // Sender-controlled text must not become an image or link in the chat.
  expect(notices[0]).not.toContain('![x](')
  expect(notices[1]).toContain('could not summarize')
  expect(f.read).toEqual(expect.arrayContaining(['thr_1', 'thr_2', 'thr_3']))
  expect((await f.inbound.list('all')).map(m => m.category).sort()).toEqual(['noise', 'project', 'project'])
  expect(f.systemNotes()).toHaveLength(0)

  await f.inbound.maybeDigest()
  expect(f.assistantChat()).toHaveLength(0)
  f.advance(3600_000)
  await f.inbound.maybeDigest()
  await f.inbound.maybeDigest()
  const digests = f.assistantChat().map(m => m.text)
  expect(digests).toHaveLength(1)
  expect(digests[0]).toContain('Newsletter')
})

test('noise stays out of the inbox: DMARC reports without the model, and what the reader filters on personal addresses too', async () => {
  const f = await setup({
    thr_1: [message('msg_1', 'thr_1', { subject: 'Hi', toAddr: 'owner@acme.example', createdAt: '2026-10-19T06:00:00.000Z' })],
    thr_2: [message('msg_2', 'thr_2', { subject: 'Newsletter', toAddr: 'owner@acme.example', fromAddr: 'troy@mailgenius.test', createdAt: '2026-10-19T06:01:00.000Z' })],
    thr_3: [message('msg_3', 'thr_3', { subject: 'Report domain: acme.example Submitter: google.com Report-ID: 1', fromAddr: 'noreply-dmarc-support@google.com', attachments: [{ filename: 'r.xml.gz', contentType: 'application/gzip', sizeBytes: 900 }], createdAt: '2026-10-19T06:02:00.000Z' })],
    thr_4: [message('msg_4', 'thr_4', { subject: '[Preview] Report Domain: acme.example Submitter: enterprise.protection.outlook.com', fromAddr: 'dmarcreport@microsoft.com', createdAt: '2026-10-19T06:03:00.000Z' })],
  })
  await f.inbound.catchUp()

  // The reader never sees the reports; its noise verdict on a personal address is kept.
  expect(f.classified.sort()).toEqual(['Hi', 'Newsletter'])
  const by = async (view: 'inbox' | 'noise' | 'done' | 'all') => (await f.inbound.list(view)).map(m => `${m.subject.slice(0, 10)}:${m.category}:${m.status}`)
  expect(await by('inbox')).toEqual(['Hi:owner:handled'])
  expect(await by('noise')).toEqual(['[Preview] :noise:handled', 'Report dom:noise:handled', 'Newsletter:noise:handled'])
  expect(await by('done')).toEqual([])
  expect(await by('all')).toHaveLength(4)
  // The home screen: the real mail needs the owner; the slip into the inbox counts both lists.
  expect(await f.inbound.home()).toMatchObject({ count: 1, needs: [{ title: 'Mail for you from Jane', action: { to: expect.stringMatching(/^\/mail\/in\//) } }],
    slip: { to: '/mail/inbox', title: '1 in your inbox', meta: 'Latest from Jane', badges: [{ label: '3 low priority' }] } })
  // Only the real mail reached the chat; the rest waits for the digest.
  expect(f.leoChat().map(m => m.text)).toHaveLength(1)
  expect(f.leoChat()[0]!.text).toContain('Summary of Hi')
  f.advance(4 * 3600_000)
  await f.inbound.maybeDigest()
  expect(f.assistantChat()[0]!.text).toContain('3 low-priority mails')

  // Done moves a mail between the views; noise closed by the owner leaves Low priority.
  await f.inbound.markDone((await f.inbound.list('noise'))[0]!.id)
  expect(await by('noise')).toHaveLength(2)
  expect(await by('done')).toEqual(['[Preview] :noise:done'])
})

test("the intake address follows only the owner's own forwards that SES saw pass DMARC", async () => {
  const forward = 'Draft a polite no.\n\n---------- Forwarded message ---------\nFrom: Seller <s@shop.test>\nBuy now'
  const cases = [
    { name: 'verified', from: OWNER, headers: SES_PASS, trusted: true },
    { name: 'DMARC failed at SES, a pass copied in by the sender', from: OWNER, trusted: false,
      headers: SES_PASS.replace('dmarc=pass header.from=owner.example;', 'dmarc=fail header.from=owner.example;') + '\nAuthentication-Results: amazonses.com; dmarc=pass header.from=owner.example' },
    { name: 'someone else, passing for their own domain', from: 'eve@evil.test', trusted: false,
      headers: SES_PASS.replaceAll('owner.example', 'evil.test').replace(`Owner Name <eve@evil.test>`, 'Eve <eve@evil.test>') },
  ]
  for (const c of cases) {
    const f = await setup({ thr_in: [message('msg_in', 'thr_in', { toAddr: 'in@acme.example', fromAddr: c.from, subject: 'Fwd: Offer', bodyText: forward })] }, { msg_in: c.headers })
    await f.inbound.catchUp()
    const [mail] = await f.inbound.list('all')
    expect({ case: c.name, trusted: mail?.trusted, intakes: f.intakes.length }).toEqual({ case: c.name, trusted: c.trusted, intakes: c.trusted ? 1 : 0 })
    if (c.trusted) expect(f.intakes[0]).toMatchObject({ instruction: 'Draft a polite no.', forwarded: expect.stringContaining('Buy now') })
    else expect(f.assistantChat()[0]?.text).toContain('NOT verified')
    expect(f.systemNotes()).toHaveLength(0)
  }
})

test('a reply draft is revised server side, never by an agent session, and sent in the mail thread', async () => {
  const f = await setup({ thr_1: [message('msg_1', 'thr_1')] })
  await f.inbound.catchUp()
  const [mail] = await f.inbound.list('inbox')
  const draft = await f.inbound.draftReply(mail!.id, 'Say yes')
  expect(draft).toMatchObject({ from: 'hello@acme.example', to: ['jane@example.test'], body: 'Reply: Say yes', inboundId: mail!.id })

  await f.stack.mail.revise(draft.id, 'Shorter')
  await Bun.sleep(0)
  const revised = (await f.stack.mail.listDrafts({})).find(d => d.id === draft.id)!
  expect(revised).toMatchObject({ state: 'draft', body: 'Reply: Shorter' })
  expect(f.drafted[1]).toMatchObject({ previous: { body: 'Reply: Say yes' } })
  expect(f.systemNotes()).toHaveLength(0)

  await f.stack.mail.queue(draft.id, revised.revision)
  f.advance(10_000)
  await f.stack.mail.tick()
  expect(f.sends).toEqual([{ inboxId: 'inb_hello', mail: expect.objectContaining({ to: 'jane@example.test', threadId: 'thr_1', body: 'Reply: Shorter' }) }])
  // Answered means done, audited as such, and gone from the inbox.
  expect((await f.inbound.get(mail!.id)).status).toBe('done')
  expect(await f.inbound.list('inbox')).toEqual([])
  expect(await f.inbound.home()).toMatchObject({ count: 0, needs: [], slip: { title: 'Inbox clear', meta: 'Nothing waiting for you', badges: [] } })
  expect(await f.auditLines('inbound_done')).toEqual([{ ref: mail!.id, detail: { by: 'reply', draftId: draft.id } }])
})

test("with the host's own transport, OpenMail addresses send through OpenMail and every other sender through the host's", async () => {
  const hostSends: OutgoingMail[] = []
  const gmail: MailTransport = { name: 'gmail', send: async mail => { hostSends.push(mail); return { outcome: 'sent', messageId: '<host@example.test>' } } }
  const f = await setup({ thr_1: [message('msg_1', 'thr_1')] }, {}, async () => {}, gmail)
  await f.inbound.catchUp()
  const [mail] = await f.inbound.list('inbox')
  const viaOpenMail = await f.inbound.draftReply(mail!.id, 'Say yes')
  await f.stack.mail.saveSender({ agentId: 'leo', address: 'sam@personal.example', name: 'Sam', isDefault: false })
  const conversationId = viaOpenMail.conversationId
  if (!conversationId) throw new Error('The reply draft has no conversation')
  const viaHost = await f.stack.mail.createDraft({ conversationId, from: 'sam@personal.example', to: ['bob@example.test'], cc: [], subject: 'Hello', body: 'Hi Bob' })

  await f.stack.mail.queue(viaOpenMail.id, viaOpenMail.revision)
  await f.stack.mail.queue(viaHost.id, viaHost.revision)
  f.advance(10_000)
  await f.stack.mail.tick()

  expect(f.sends).toEqual([{ inboxId: 'inb_hello', mail: expect.objectContaining({ to: 'jane@example.test', body: 'Reply: Say yes' }) }])
  expect(hostSends).toEqual([expect.objectContaining({ from: 'sam@personal.example', to: ['bob@example.test'], body: 'Hi Bob' })])
  expect((await f.stack.mail.listDrafts({}, true)).map(d => d.id).sort()).toEqual([viaOpenMail.id, viaHost.id].sort())
})

test('a contact form mail is answered at its Reply-To, not at the form sender', async () => {
  const form = { fromAddr: 'noreply@form.test', addressNames: { 'noreply@form.test': 'Acme' } }
  const f = await setup({
    thr_1: [message('msg_1', 'thr_1', form)],
    thr_2: [message('msg_2', 'thr_2', { ...form, createdAt: '2026-10-19T06:01:00.000Z' })],
  }, {
    msg_1: 'From: "Acme" <noreply@form.test>\nReply-To:\n "Visitor, Jr." <Visitor@Example.test>\nTo: <hello@acme.example>',
    msg_2: 'From: "Acme" <noreply@form.test>\nReply-To: <noreply@form.test>\nTo: <hello@acme.example>',
  })
  await f.inbound.catchUp()
  const [withReplyTo, sameAsFrom] = [...await f.inbound.list('inbox')].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
  expect(withReplyTo).toMatchObject({ fromAddress: 'noreply@form.test', replyTo: 'visitor@example.test' })
  expect(sameAsFrom).toMatchObject({ replyTo: null })
  expect(f.leoChat()[0]!.text).toContain('Reply to: visitor@example\\.test')

  expect(await f.inbound.draftReply(withReplyTo!.id, 'Say yes')).toMatchObject({ to: ['visitor@example.test'] })
  expect(await f.inbound.draftReply(sameAsFrom!.id, 'Say yes')).toMatchObject({ to: ['noreply@form.test'] })
})

test('agents read the inbox views and close mail as themselves, audited; nothing else, and only when mail is on', async () => {
  const f = await setup({
    thr_1: [message('msg_1', 'thr_1', { createdAt: '2026-10-19T06:00:00.000Z' })],
    thr_2: [message('msg_2', 'thr_2', { fromAddr: 'bob@other.test', addressNames: { 'bob@other.test': 'Bob Builder' }, createdAt: '2026-10-19T06:05:00.000Z' })],
  }, {}, async ctx => { if (ctx.agentId === 'muted') ctx.allowed = false })
  await f.inbound.catchUp()
  const scope = { conversation: f.leoConversation() }
  expect(scope.conversation).not.toBe('')

  // Same rows and shape as the owner's list, newest first.
  const all = await f.inbound.agentList(scope, { view: 'inbox' })
  expect(all).toEqual(await f.inbound.list('inbox'))
  expect(all.map(m => m.fromAddress)).toEqual(['bob@other.test', 'jane@example.test'])
  // `from` matches the address or the name, in any case; LIKE wildcards are literal.
  expect((await f.inbound.agentList({ agent: f.leoId }, { view: 'inbox', from: 'BOB' })).map(m => m.fromAddress)).toEqual(['bob@other.test'])
  expect((await f.inbound.agentList(scope, { view: 'inbox', from: 'jane@' })).map(m => m.fromAddress)).toEqual(['jane@example.test'])
  expect(await f.inbound.agentList(scope, { view: 'inbox', from: '%' })).toEqual([])

  // Who asks must be known and allowed.
  await expect(f.inbound.agentList({}, { view: 'inbox' })).rejects.toMatchObject({ statusCode: 400 })
  await expect(f.inbound.agentList({ conversation: 'nope' }, { view: 'inbox' })).rejects.toMatchObject({ statusCode: 404 })
  await expect(f.inbound.agentList({ agent: 'other', conversation: scope.conversation }, { view: 'inbox' })).rejects.toMatchObject({ statusCode: 400 })
  await expect(f.inbound.agentList({ agent: 'muted' }, { view: 'inbox' })).rejects.toMatchObject({ statusCode: 403, message: 'Mail is turned off for this agent' })
  await expect(f.inbound.agentMarkDone(all[1]!.id, { agent: 'muted' })).rejects.toMatchObject({ statusCode: 403 })
  expect((await f.inbound.get(all[1]!.id)).status).toBe('handled')

  // Done: audited as the agent, hidden by default, idempotent, 404 for an unknown id.
  const done = await f.inbound.agentMarkDone(all[1]!.id, scope)
  expect(done.status).toBe('done')
  expect(await f.inbound.agentMarkDone(all[1]!.id, scope)).toEqual(done)
  await expect(f.inbound.agentMarkDone('missing', scope)).rejects.toMatchObject({ statusCode: 404 })
  expect(await f.auditLines('inbound_done')).toEqual([{ ref: all[1]!.id, detail: { by: 'agent', agentId: f.leoId } }])
  expect((await f.inbound.agentList(scope, { view: 'inbox' })).map(m => m.id)).toEqual([all[0]!.id])
  expect((await f.inbound.agentList(scope, { view: 'all' })).map(m => m.id)).toEqual([all[0]!.id, all[1]!.id])

  // The owner closing it from the app stays the same call, without an agent in the audit line.
  await f.inbound.markDone(all[0]!.id)
  expect((await f.auditLines('inbound_done')).map(l => l.detail)).toEqual([{ by: 'agent', agentId: f.leoId }, {}])
})
})
