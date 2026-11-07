import { expect, test } from 'bun:test'
import { createOpenMailTransport } from './transports'
import { OpenMailError, type OpenMailClient } from './openmail'

// Contract: OpenMail's outbound allowlist gets the approved recipients before the send, the send
// goes out from the inbox that owns the From address, and one draft revision has one stable key.
test('openmail transport allows the approved recipients, then sends from the matching inbox', async () => {
  const calls: string[] = []
  const client = {
    allowOutbound: async (value: string) => { calls.push(`allow ${value}`) },
    send: async (inboxId: string, mail: { to: string, cc: string[], threadId?: string, idempotencyKey?: string }) => {
      calls.push(`send ${inboxId} ${mail.to} cc=${mail.cc.join(',')} thread=${mail.threadId} key=${mail.idempotencyKey}`)
      return { id: 'msg_1', threadId: 'thr_1' }
    },
  } as unknown as OpenMailClient
  const inboxes: Record<string, string> = { 'hello@acme.example': 'inb_hello' }
  const transport = createOpenMailTransport(client, async address => inboxes[address.toLowerCase()])
  const mail = { from: 'Hello@acme.example', to: ['jane@example.test'], cc: ['bob@example.test'], subject: 'Re: Hi', body: 'Thanks', threadId: 'thr_1', idempotencyKey: 'draft-1:3' }

  expect(await transport.send(mail)).toEqual({ outcome: 'sent', messageId: 'msg_1' })
  expect(calls[0]).toBe('allow jane@example.test')
  expect(calls[1]).toBe('allow bob@example.test')
  expect(calls[2]).toStartWith('send inb_hello jane@example.test cc=bob@example.test thread=thr_1 key=')
  await transport.send(mail)
  expect(calls[5]).toBe(calls[2])

  expect(await transport.send({ ...mail, from: 'owner@owner.example' })).toMatchObject({ outcome: 'failed' })
  expect(await transport.send({ ...mail, to: ['a@example.test', 'b@example.test'] })).toMatchObject({ outcome: 'failed' })
  expect(calls).toHaveLength(6)
})

test('openmail transport reports a refused recipient as failed and a lost connection as thrown', async () => {
  const refuse = { allowOutbound: async () => {}, send: async () => { throw new OpenMailError(403, 'recipient_not_permitted', 'Sending to x is not permitted.') } }
  const lost = { allowOutbound: async () => {}, send: async () => { throw new TypeError('fetch failed') } }
  const mail = { from: 'hello@acme.example', to: ['x@example.test'], cc: [], subject: 'S', body: 'B' }
  expect(await createOpenMailTransport(refuse as unknown as OpenMailClient, async () => 'inb').send(mail))
    .toEqual({ outcome: 'failed', error: 'Sending to x is not permitted.' })
  // Thrown means "maybe delivered": the scheduler marks the draft delivery unknown, never retries.
  await expect(createOpenMailTransport(lost as unknown as OpenMailClient, async () => 'inb').send(mail)).rejects.toThrow('fetch failed')
})
