import type { MailDraft, MailReply, MailSender } from './types'

// Sample data from the design (Thursday 15 October 2026, about 14:30 in Amsterdam = 12:30 UTC),
// for building screens before the server is done. Addresses are samples. Never send to them.

const AGENT = 'agent-acme'
const CONVERSATION = 'conv-outreach'

const draft = (d: Pick<MailDraft, 'id' | 'to' | 'subject' | 'body' | 'contextLabel'> & Partial<MailDraft>): MailDraft => ({
  agentId: AGENT,
  conversationId: CONVERSATION,
  from: 'sam@example.app',
  cc: [],
  contextHref: '/w/outreach',
  state: 'draft',
  revision: 1,
  queuedRevision: null,
  sendAt: null,
  sentAt: null,
  outcome: null,
  error: null,
  messageId: null,
  revisionNote: null,
  inboundId: null,
  createdAt: '2026-10-15T12:28:00.000Z',
  updatedAt: '2026-10-15T12:28:00.000Z',
  ...d,
})

export const sampleDrafts: MailDraft[] = [
  draft({
    id: 'draft-iculture',
    to: ['press@news-one.example'],
    subject: 'Acme: live ondertiteling op je iPhone',
    body: 'Hoi iCulture,\n\nik ben Sam, maker van Acme. De app ondertitelt gesprekken live, in het Nederlands en Engels. Zin om hem te testen? Ik stuur graag een promocode.\n\nGroet,\nSam',
    contextLabel: 'iCulture · Outreach',
  }),
  draft({
    id: 'draft-tweakers',
    to: ['tips@news-two.example'],
    subject: 'Tip: Nederlandse app voor live ondertiteling',
    body: 'Hoi redactie,\n\nAcme ondertitelt spraak live. Lancering 3 november, persmap en testaccount liggen klaar.\n\nGroet,\nSam Jansen',
    contextLabel: 'Tweakers · Outreach',
  }),
  draft({
    id: 'draft-bright',
    to: ['press@news-three.example'],
    subject: 'Gesprekken meelezen als je slecht hoort',
    body: 'Hoi Bright,\n\nmet Acme lees je live mee wat er gezegd wordt. Mag ik een testversie sturen?\n\nGroet,\nSam',
    contextLabel: 'Bright · Outreach',
  }),
]

// The mail Hoormij replied to (sent 8 Oct).
export const sampleSentHoormij: MailDraft = draft({
  id: 'draft-hoormij',
  to: ['info@listen.example'],
  subject: 'Acme in jullie appoverzicht?',
  body: 'Hoi Hoormij,\n\nik ben Sam, maker van Acme, een app die gesprekken live ondertitelt. Past hij in jullie appoverzicht?\n\nGroet,\nSam',
  contextLabel: 'Hoormij · Outreach',
  state: 'sent',
  outcome: 'sent',
  sentAt: '2026-10-08T08:12:00.000Z',
  messageId: '<sample-hoormij-1@example.app>',
  createdAt: '2026-10-08T08:05:00.000Z',
  updatedAt: '2026-10-08T08:12:00.000Z',
})

export const sampleReplies: MailReply[] = [
  {
    id: 'reply-hoormij',
    draftId: 'draft-hoormij',
    messageId: '<sample-reply-1@listen.example>',
    fromName: 'Marieke, Hoormij',
    fromAddress: 'info@listen.example',
    subject: 'Re: Acme in jullie appoverzicht?',
    body: 'Hoi Sam, dank je. We testen apps voordat we ze opnemen. Kun je twee testaccounts sturen? Dan gaat Acme mee in de ronde van november. Groet, Marieke',
    receivedAt: '2026-10-14T13:58:00.000Z',
    agentNote: 'Marked Hoormij as replied in Outreach. Added a task.',
    readAt: null,
  },
]

export const sampleSenders: MailSender[] = [
  { id: 'sender-sam', agentId: AGENT, address: 'sam@example.app', name: 'Sam Jansen', isDefault: true, createdAt: '2026-10-12T08:00:00.000Z' },
  { id: 'sender-hello', agentId: AGENT, address: 'hello@example.app', name: 'Acme', isDefault: false, createdAt: '2026-10-12T08:00:00.000Z' },
]
