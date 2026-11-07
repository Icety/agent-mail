import { createHash } from 'node:crypto'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { MailRepo } from '../ports'
import type { MailService } from './mail'

export const createImapPoller = (url: string, repo: MailRepo, service: MailService, now: () => Date) => {
  if (!url) throw new Error('IMAP is not configured')
  const config = new URL(url)
  if (!['imap:', 'imaps:'].includes(config.protocol)) throw new Error('Unsupported IMAP URL')
  const mailbox = decodeURIComponent(config.pathname.slice(1)) || 'INBOX'
  const account = createHash('sha256').update(url).digest('hex').slice(0, 24)
  let polling = false
  return async (): Promise<void> => {
    if (polling) return
    polling = true
    const client = new ImapFlow({ host: config.hostname, port: Number(config.port) || (config.protocol === 'imaps:' ? 993 : 143),
      secure: config.protocol === 'imaps:', auth: { user: decodeURIComponent(config.username), pass: decodeURIComponent(config.password) }, logger: false })
    // Error events must not bring down the app. Poll failures are logged by the scheduler.
    client.on('error', () => {})
    try {
      await client.connect()
      const lock = await client.getMailboxLock(mailbox)
      try {
        if (!client.mailbox) return
        const validity = client.mailbox.uidValidity.toString()
        const key = `imap:${account}:${mailbox}:${validity}:lastUid`
        const lastUid = Number(await repo.getState(key) ?? '0')
        if (client.mailbox.uidNext <= lastUid + 1) return
        for await (const message of client.fetch(`${lastUid + 1}:*`, { uid: true, source: true, internalDate: true }, { uid: true })) {
          if (message.uid <= lastUid) continue
          if (!message.source) throw new Error(`IMAP message ${message.uid} has no source`)
          const parsed = await simpleParser(message.source)
          const references = [...(parsed.inReplyTo ? [parsed.inReplyTo] : []), ...(Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [])]
          const sender = parsed.from?.value[0]
          await service.ingest({ messageId: parsed.messageId ?? '', references, fromName: sender?.name ?? '',
            fromAddress: sender?.address ?? '', subject: parsed.subject ?? '', body: parsed.text ?? '',
            receivedAt: parsed.date ?? (message.internalDate instanceof Date ? message.internalDate : now()) })
          // A UID is only checkpointed after durable storage and inbox notification succeeded.
          await repo.setState(key, String(message.uid), now())
        }
      }
      finally { lock.release() }
    }
    finally {
      polling = false
      try { await client.logout() }
      catch { client.close() }
    }
  }
}
