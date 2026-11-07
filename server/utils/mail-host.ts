import type { H3Event } from 'h3'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { NitroApp } from 'nitropack/types'
import type { MailHostPorts, MailStore } from '../../lib/ports'
import { createMailStack, type MailStack } from '../../lib/stack'
import { startMailBackground } from '../../lib/background'
import { createLogTransport, createSmtpTransport } from '../../lib/services/transports'
import { createImapPoller } from '../../lib/services/imap'
import { createOpenMailClient } from '../../lib/services/openmail'
import { createClaudeRunner, createMailReader, type RunModel } from '../../lib/services/reader'
import type { MailService } from '../../lib/services/mail'
import type { InboundService } from '../../lib/services/inbound'
import type { MailTransport } from '../../shared/types'

// Everything the host app gives agent mail on the server. Call defineMailHost once, from a Nitro
// plugin in the host:
//
//   export default defineNitroPlugin(nitroApp => defineMailHost(nitroApp, { ... }))
export interface MailServerHost extends MailHostPorts {
  // Opened on first use, so a broken mail store never takes the host down at boot.
  store: () => MailStore
  // Owner routes (/api/mail/*): throw (401/403) unless the owner's session is on the request.
  requireOwner: (event: H3Event) => Promise<void>
  // Agent routes (/api/internal/mail/*): throw unless the request carries the internal token.
  requireAgent: (event: H3Event) => Promise<void>
  // Replaces the configured transport (log or SMTP); OpenMail still wins when configured.
  transport?: MailTransport
  // The model the inbound reader runs. Default: the Claude Code CLI, tool-less (createClaudeRunner).
  runModel?: RunModel
}

let host: MailServerHost | undefined
let stack: MailStack | undefined
let imapPoll: (() => Promise<void>) | undefined

export const defineMailHost = (nitroApp: NitroApp, definition: MailServerHost): void => {
  if (host) throw new Error('[mail] defineMailHost was called twice')
  host = definition
  const config = useRuntimeConfig().mail
  const background = startMailBackground({
    stack: useMailStack,
    pollImap: () => imapPoll?.() ?? Promise.resolve(),
    openmail: config.openmail.apiKey ? { wsUrl: config.openmail.wsUrl, apiKey: config.openmail.apiKey } : undefined,
  })
  nitroApp.hooks.hook('close', () => background.stop())
}

export const useMailHost = (): MailServerHost => {
  if (!host) throw createError({ statusCode: 503, statusMessage: 'Mail is not set up in this app (defineMailHost)' })
  return host
}

const useMailStack = (): MailStack => {
  if (stack) return stack
  const h = useMailHost()
  const config = useRuntimeConfig().mail
  const owner = config.openmail.ownerAddress
  const openmail = config.openmail.apiKey
    ? {
        client: createOpenMailClient({ apiKey: config.openmail.apiKey, baseUrl: config.openmail.baseUrl, podId: config.openmail.podId }),
        reader: createMailReader(h.runModel ?? createClaudeRunner({ claudeBin: config.claudeBin || 'claude', model: config.openmail.model }), h.owner),
        ownerAddress: owner,
        digestHour: Number(config.openmail.digestHour),
      }
    : undefined
  if (openmail && !owner) throw new Error('[mail] NUXT_MAIL_OPENMAIL_OWNER_ADDRESS is required with OpenMail')
  const created = createMailStack({
    host: h, store: h.store(), now: () => new Date(), sendDelaySeconds: Number(config.sendDelaySeconds),
    transport: h.transport ?? (config.smtpUrl ? createSmtpTransport(config.smtpUrl) : createLogTransport()),
    openmail,
  })
  if (config.imapUrl) imapPoll = createImapPoller(config.imapUrl, created.repo, created.mail, () => new Date())
  stack = created
  return created
}

// The migrations folder at runtime. The server bundle has no files next to it, so look for the
// installed package from the working directory up (workspaces hoist node_modules), then in this
// repo (developing the package).
export const mailMigrationsDir = (dialect: 'sqlite' | 'pg'): string => {
  const inPackage = join('lib', 'storage', dialect, 'migrations')
  const candidates: string[] = []
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    candidates.push(join(dir, 'node_modules', '@icety', 'agent-mail', inPackage))
    if (dirname(dir) === dir) break
  }
  candidates.push(join(process.cwd(), inPackage))
  const found = candidates.find(dir => existsSync(join(dir, 'meta', '_journal.json')))
  if (!found) throw new Error(`[mail] ${dialect} migrations not found from ${process.cwd()}`)
  return found
}

export const useMailService = (): MailService => useMailStack().mail
// Undefined when OpenMail is not configured (NUXT_MAIL_OPENMAIL_API_KEY).
export const useMailInbound = (): InboundService | undefined => useMailStack().inbound
export const requireMailInbound = (): InboundService => {
  const inbound = useMailInbound()
  if (!inbound) throw createError({ statusCode: 404, statusMessage: 'Agent mail is not configured' })
  return inbound
}
