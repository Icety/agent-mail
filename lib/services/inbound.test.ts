import { describe, expect, test } from 'bun:test'
import { createMailStack } from '../stack'
import { createLogTransport } from './transports'
import type { OpenMailClient, OpenMailMessage, OpenMailSend } from './openmail'
import type { MailReader } from './reader'
import { createFakeHost, storeAdapters } from '../test-support'

const OWNER = 'owner@owner.example'
const SES_PASS = `Return-Path: <x@bounce.owner.example>\nAuthentication-Results: amazonses.com;\n spf=pass smtp.mailfrom=owner.example;\n dkim=pass header.i=@owner.example;\n dmarc=pass header.from=owner.example;\nFrom: Owner Name <${OWNER}>\nSubject: Fwd: Offer`

const message = (id: string, threadId: string, over: Partial<OpenMailMessage> = {}): OpenMailMessage => ({
  id, threadId, direction: 'inbound', fromAddr: 'jane@example.test', toAddr: 'hello@acme.example', subject: `Subject ${id}`,
  bodyText: `Body of ${id}`, bodyHtml: null, attachments: [], createdAt: '2026-10-19T06:00:00.000Z', addressNames: { 'jane@example.test': 'Jane' }, ...over,
})

for (const adapter of storeAdapters) describe(adapter.name, () => {
const setup = async (threads: Record<string, OpenMailMessage[]>, headers: Record<string, string> = {}) => {
  // 07:00 in Amsterdam, an hour before the digest.
  let time = Date.parse('2026-10-19T05:00:00Z')
  const fake = createFakeHost([{ id: 'koopa', name: 'Koopa' }, { id: 'leo', name: 'Acme' }])
  const read: string[] = []
  const sends: { inboxId: string, mail: OpenMailSend }[] = []
  const client = {
    listInboxes: async () => [
      { id: 'inb_hello', address: 'hello@acme.example', displayName: 'Acme' },
      { id: 'inb_in', address: 'in@acme.example', displayName: 'Intake' },
    ],
    unreadThreads: async (inboxId: string) => Object.keys(threads).filter(t => threads[t]![0]!.toAddr.startsWith(inboxId === 'inb_in' ? 'in@' : 'hello@')).map(id => ({ id })),
    threadMessages: async (threadId: string) => threads[threadId] ?? [],
    rawHeaders: async (id: string) => headers[id] ?? '',
    markThreadRead: async (threadId: string) => { read.push(threadId) },
    allowOutbound: async () => {},
    send: async (inboxId: string, mail: OpenMailSend) => { sends.push({ inboxId, mail }); return { id: `out_${sends.length}`, threadId: mail.threadId ?? 'new' } },
  } as unknown as OpenMailClient
  const intakes: { instruction: string, forwarded: string }[] = []
  const drafted: { instruction: string, previous?: unknown }[] = []
  const reader: MailReader = {
    classify: async mail => {
      if (mail.subject.includes('Broken')) throw new Error('model down')
      return { category: mail.subject.includes('Newsletter') ? 'noise' : 'project', summary: `Summary of ${mail.subject}`, suggestedAction: 'Reply' }
    },
    draftReply: async ({ instruction, previous }) => { drafted.push({ instruction, previous }); return { subject: 'Re: Hi', body: `Reply: ${instruction}` } },
    intake: async input => { intakes.push(input); return { reply: 'Intake answer' } },
  }
  const stack = createMailStack({
    host: fake.host, store: await adapter.open(), now: () => new Date(time), sendDelaySeconds: 10, transport: createLogTransport(),
    openmail: { client, reader, ownerAddress: OWNER, digestHour: 8 },
  })
  return { stack, inbound: stack.inbound!, read, sends, intakes, drafted, advance: (ms: number) => { time += ms },
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
  expect((await f.inbound.list(false)).map(m => m.category).sort()).toEqual(['noise', 'project', 'project'])
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
    const [mail] = await f.inbound.list(false)
    expect({ case: c.name, trusted: mail?.trusted, intakes: f.intakes.length }).toEqual({ case: c.name, trusted: c.trusted, intakes: c.trusted ? 1 : 0 })
    if (c.trusted) expect(f.intakes[0]).toMatchObject({ instruction: 'Draft a polite no.', forwarded: expect.stringContaining('Buy now') })
    else expect(f.assistantChat()[0]?.text).toContain('NOT verified')
    expect(f.systemNotes()).toHaveLength(0)
  }
})

test('a reply draft is revised server side, never by an agent session, and sent in the mail thread', async () => {
  const f = await setup({ thr_1: [message('msg_1', 'thr_1')] })
  await f.inbound.catchUp()
  const [mail] = await f.inbound.list(false)
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
})
})
