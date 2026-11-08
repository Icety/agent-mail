import type { MailHostPorts, MailStore } from './ports'
import type { MailTransport } from '../shared/types'
import { createMailService } from './services/mail'
import { createInboundService } from './services/inbound'
import type { OpenMailClient } from './services/openmail'
import type { MailReader } from './services/reader'
import { createOpenMailTransport } from './services/transports'

export interface MailStackDeps {
  host: MailHostPorts
  store: MailStore
  now: () => Date
  sendDelaySeconds: number
  // Used when OpenMail is not configured: log (simulated), SMTP or the host's own.
  transport: MailTransport
  // The host's own transport, when it passed one. With OpenMail configured, drafts from an OpenMail
  // address go through OpenMail and every other sender through this. Without it, OpenMail sends
  // everything and a non-OpenMail sender fails.
  hostTransport?: MailTransport
  openmail?: { client: OpenMailClient, reader: MailReader, ownerAddress: string, digestHour: number }
}

export const createMailStack = (deps: MailStackDeps) => {
  const { host, store, now } = deps
  const repo = store.mail
  const inboundRepo = store.inbound
  const openmail = deps.openmail
  const publish = host.publish ?? (() => {})
  const late: { inbound?: ReturnType<typeof createInboundService> } = {}

  const mail = createMailService({
    repo, owner: host.owner, links: host.links, now, sendDelaySeconds: deps.sendDelaySeconds,
    agentScope: host.agentScope, authorize: host.authorize ?? (() => {}),
    transport: openmail ? createOpenMailTransport(openmail.client, async address => (await inboundRepo.addressByEmail(address))?.id, deps.hostTransport) : deps.transport,
    conversation: host.conversation,
    agentExists: host.agentExists,
    noteExists: host.noteExists ?? (async () => false),
    sendSystemNote: host.sendSystemNote,
    publish,
    push: host.push ?? (async () => {}),
    redraft: (draft, note) => late.inbound ? late.inbound.redraft(draft, note) : Promise.resolve(),
    threadFor: async inboundId => (await inboundRepo.getInbound(inboundId))?.threadId,
    replied: async (inboundId, draftId) => { await late.inbound?.replied(inboundId, draftId) },
    audit: (kind, ref, detail) => inboundRepo.audit(kind, ref, detail, now()),
  })

  const inbound = openmail ? createInboundService({
    repo: inboundRepo, client: openmail.client, reader: openmail.reader, now,
    owner: host.owner, assistantName: host.assistantName, links: host.links, timeZone: host.timeZone,
    ownerAddress: openmail.ownerAddress, digestHour: openmail.digestHour,
    agents: host.agents,
    notify: (agentId, text) => host.notify(agentId, text),
    getState: key => repo.getState(key),
    setState: (key, value) => repo.setState(key, value, now()),
    createReplyDraft: async input => {
      const agentId = (await host.conversation(input.conversationId))?.agentId
      if (agentId && !(await mail.listSenders(agentId)).some(s => s.address === input.from)) {
        await mail.saveSender({ agentId, address: input.from, name: input.senderName, isDefault: false })
      }
      return mail.createDraft({ conversationId: input.conversationId, from: input.from, to: [input.to], cc: [],
        subject: input.subject, body: input.body, contextLabel: input.contextLabel }, { inboundId: input.inboundId })
    },
    reviseReplyDraft: (draftId, baseRevision, reply) => mail.replyRevision(draftId, baseRevision, reply),
    stopRevise: (draftId, error) => mail.stopRevise(draftId, error),
    publish,
    conversation: host.conversation,
    authorize: async ctx => { await host.authorize?.(ctx) },
  }) : undefined
  late.inbound = inbound

  return { mail, inbound, repo }
}
export type MailStack = ReturnType<typeof createMailStack>
