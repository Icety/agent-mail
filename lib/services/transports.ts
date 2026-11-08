import { createHash } from 'node:crypto'
import nodemailer from 'nodemailer'
import type { MailTransport } from '../../shared/types'
import { OpenMailError, type OpenMailClient } from './openmail'

// OpenMail wants a UUID; derive a stable one so the same draft revision can never send twice.
const uuidFrom = (key: string): string => {
  const h = createHash('sha256').update(key).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

// Sends through the OpenMail inbox that owns the From address. Every recipient of the approved
// snapshot is added to the pod's outbound allowlist first, so OpenMail itself refuses anything
// that did not pass the owner's Send. `other`: the host's own transport for senders that are not
// OpenMail addresses (e.g. the owner's own mailbox); without it such a draft fails.
export const createOpenMailTransport = (client: Pick<OpenMailClient, 'allowOutbound' | 'send'>, inboxFor: (address: string) => Promise<string | undefined>, other?: MailTransport): MailTransport => ({
  name: 'openmail',
  send: async mail => {
    const inboxId = await inboxFor(mail.from.toLowerCase())
    if (!inboxId && other) {
      const { idempotencyKey: _openMailOnly, ...rest } = mail
      return other.send(rest)
    }
    if (!inboxId) return { outcome: 'failed', error: `${mail.from} is not an OpenMail address. Pick a project address as sender` }
    const [to, ...extraTo] = mail.to
    if (!to || extraTo.length) return { outcome: 'failed', error: 'OpenMail sends to one To address. Move the others to Cc' }
    try {
      for (const recipient of [to, ...mail.cc]) await client.allowOutbound(recipient.toLowerCase())
    }
    catch (error) {
      return { outcome: 'failed', error: `Could not allow the recipients in OpenMail: ${error instanceof Error ? error.message : 'unknown error'}` }
    }
    try {
      const sent = await client.send(inboxId, { to, cc: mail.cc, subject: mail.subject, body: mail.body, threadId: mail.threadId,
        idempotencyKey: mail.idempotencyKey ? uuidFrom(mail.idempotencyKey) : undefined })
      return { outcome: 'sent', messageId: sent.id }
    }
    catch (error) {
      // A 4xx is a refusal before anything was sent. Anything else may have delivered: rethrow.
      if (error instanceof OpenMailError && error.status >= 400 && error.status < 500) return { outcome: 'failed', error: error.message }
      throw error
    }
  },
})

export const createLogTransport = (): MailTransport => ({
  name: 'log',
  send: async () => ({ outcome: 'simulated' }),
})

export const createSmtpTransport = (smtpUrl: string): MailTransport => {
  if (!smtpUrl) throw new Error('SMTP is not configured')
  const client = nodemailer.createTransport(smtpUrl)
  return {
    name: 'smtp',
    send: async mail => {
      const result = await client.sendMail({ from: mail.from, to: mail.to, cc: mail.cc,
        subject: mail.subject, text: mail.body, inReplyTo: mail.inReplyTo, references: mail.references,
        disableFileAccess: true, disableUrlAccess: true })
      if (!result.accepted.length) return { outcome: 'failed', error: 'The mail server rejected every recipient' }
      if (result.rejected.length) throw new Error('The mail server accepted only some recipients. Check delivery before resending')
      return { outcome: 'sent', messageId: result.messageId }
    },
  }
}
