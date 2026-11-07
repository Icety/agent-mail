# agent-mail

Mail for apps where Claude agents work for one person (the owner). Agents write drafts, the owner
reviews and sends them with a 10 second undo, replies come back into the agent's conversation, and
mail on project addresses (OpenMail) is read by a tool-less model, summarized in chat and answered
with drafts the owner sends.

Nothing goes out without the owner's tap on Send. Agents have no send route.

Used by Koopa (Thomas), Toadette (Sanne) and Moonies internal. Started as Koopa's `layers/mail`.

## What is in here

| Folder | What |
| --- | --- |
| `shared/` | Wire types, zod request schemas, the pure draft state machine (`transition`) |
| `lib/` | Services (mail, inbound, reader, transports, OpenMail, IMAP), the storage port and the background loop. Plain TypeScript, no Nuxt |
| `lib/storage/sqlite`, `lib/storage/pg` | The two storage adapters and their migrations |
| `server/` | Nuxt layer: routes under `/api/mail` (owner) and `/api/internal/mail` (agents), `defineMailHost` |
| `app/` | Nuxt layer: `Mail*` components, `useMail*` composables, pages under `/mail` |
| `lib/mail.sh` | The agents' CLI (draft, revise, list drafts and replies) |
| `playground/` | A small host for typecheck, build and a local look |

Runtime: Bun (bun:sqlite, `Bun.spawn`, `HTMLRewriter`). Nuxt 4, Nuxt UI 4, Drizzle, zod 4.

## Install

```bash
bun add github:Icety/agent-mail#v0.1.0
```

Pin a tag. Update by moving the tag in `package.json` and running `bun install`.

## Wire it into a Nuxt app

### 1. Extend the layer

```ts
// nuxt.config.ts (or a layer of the app, e.g. layers/mail/nuxt.config.ts)
export default defineNuxtConfig({
  extends: ['@icety/agent-mail'],
})
```

### 2. Storage

SQLite (one file shared with the host app; mail keeps its own migrations table
`__drizzle_migrations_mail`):

```ts
import { createSqliteMailStore } from '@icety/agent-mail/sqlite'
store: () => createSqliteMailStore(sqliteConnection, mailMigrationsDir('sqlite'))
```

Postgres (any Drizzle pg database: postgres-js, node-postgres, PGlite). Either re-export the tables
from your own Drizzle schema and let drizzle-kit generate your migrations:

```ts
// server/db/schema/mail.ts
export * from '@icety/agent-mail/pg/schema'
```

or run the shipped migrations once at startup with
`migrate(db, { migrationsFolder: mailMigrationsDir('pg'), migrationsTable: '__drizzle_migrations_mail' })`.
Then:

```ts
import { createPgMailStore } from '@icety/agent-mail/pg'
store: () => createPgMailStore(db)
```

Tables: `mail_senders`, `mail_drafts`, `mail_replies`, `mail_state`, `mail_addresses`,
`mail_inbound`, `mail_audit`. `agent_id` and `conversation_id` are your ids (text); there are no
foreign keys into your tables.

### 3. Server host (Nitro plugin)

```ts
// server/plugins/mail-host.ts
export default defineNitroPlugin(nitroApp => defineMailHost(nitroApp, {
  store: () => createSqliteMailStore(connection, mailMigrationsDir('sqlite')),
  requireOwner: async event => { await requireUserSession(event) },   // the owner's login
  requireAgent: async event => { /* check the internal bearer token */ },
  owner: { name: 'Sam', fullName: 'Sam Jansen' },
  assistantName: 'Toad',                    // named in notices: "Toad could not summarize this mail"
  timeZone: 'Europe/Amsterdam',             // digest hour
  links: {                                  // paths in your app
    conversation: id => `/c/${id}`,
    fallback: '/mail',
    inbound: id => `/mail/in/${id}`,
    inbox: '/mail/inbox',
  },
  conversation: async id => /* { agentId } of that conversation, or undefined */,
  agentExists: async id => /* boolean */,
  agents: async () => /* [{ id, name }] */,
  sendSystemNote: async (conversationId, text) => /* a note TO the agent in that conversation */,
  noteExists: async (conversationId, text) => /* that exact system note is already stored */,
  notify: async (agentId, text) => /* a visible message to the owner in that agent's main chat (null: main assistant); return { conversationId } */,
  push: async ({ title, body, url }) => {},                  // optional
  publish: (topic, data) => {},                              // optional, live topics (see 5)
  authorize: ctx => { /* set ctx.allowed = false to turn mail off for ctx.agentId */ },  // optional
  agentScope: ctx => { /* add project agent ids to ctx.projectAgentIds (badge) */ },     // optional
  transport: undefined,   // optional: your own MailTransport (e.g. Gmail API); default log or SMTP
  runModel: undefined,    // optional: the reader's model call; default `claude -p` tool-less
}))
```

Every route calls `requireOwner` or `requireAgent` itself, so the layer is safe in an app without
global API middleware. `defineMailHost` also starts the background work (send scheduler, reply
polling, OpenMail events, digest) and stops it on close. Mail failures are logged, never thrown at
boot.

**Conversations.** Drafts belong to a conversation, which belongs to an agent. An app without chat
conversations can still map its own ids: a conversation can be `lead:123` that `conversation()`
resolves to the agent working on leads, with `sendSystemNote` forwarding revise requests and
replies to wherever that agent reads them.

**runModel.** The reader (classify, summarize, draft replies) is one function:
`({ system, prompt, schema }) => Promise<unknown>` returning JSON that matches `schema`. Without
the Claude Code CLI on the server, pass one that calls the Messages API with structured output.
Keep it tool-less: the input is untrusted mail.

### 4. Client host (Nuxt plugin)

```ts
// app/plugins/mail-host.client.ts
export default defineNuxtPlugin(() => ({
  provide: {
    mailHost: defineMailClientHost({
      appName: 'Toadette',
      assistantLabel: 'Toadette (main assistant)',
      live: (topic, handler) => /* subscribe; return unsubscribe. Without it: a 30 s poll */,
      agents: agentsRef,                                     // optional
      conversationTitle: id => /* title */,                  // optional
      askAgent: async (conversationId, text) => {},          // optional, "Ask agent to draft a reply"
    }),
  },
}))
```

### 5. Live topics

The server publishes `mail.draft`, `mail.reply`, `mail.inbound` and `mail.summary`
(`MailTopicMap` in `shared/types.ts`). Forward them to your live channel (SSE, WebSocket) and back
into `live` on the client. Without a channel, leave both out; the screens poll.

### 6. Theming

In the CSS file that imports Tailwind and Nuxt UI:

```css
@import "tailwindcss";
@import "@nuxt/ui";
@import "@icety/agent-mail/css";
@source "../../node_modules/@icety/agent-mail";   /* relative to this file */
```

That is enough: every token falls back to Nuxt UI's variables. To match your own design system, set
any of the `--mail-*` variables (`app/assets/mail.css` lists them all), for example
`:root { --mail-card: var(--my-card); --mail-radius-card: 20px; }`.

### 7. Agents

Give agents `lib/mail.sh` (or the routes directly) with `MAIL_API_URL`, `MAIL_TOKEN_FILE` and
`MAIL_CONVERSATION`. Senders: each agent drafts from one of its configured senders
(`POST /api/mail/senders`, or the senders editor in the mail panel).

## Config (runtimeConfig.mail, env NUXT_MAIL_*)

| Env | What |
| --- | --- |
| `NUXT_MAIL_SMTP_URL` | `smtps://user:pass@host`. Empty: the log transport, which never sends and marks drafts "Simulated" |
| `NUXT_MAIL_IMAP_URL` | `imaps://user:pass@host/INBOX`. Empty: no reply polling |
| `NUXT_MAIL_SEND_DELAY_SECONDS` | Undo window, default and minimum 10 |
| `NUXT_MAIL_CLAUDE_BIN` | Claude Code CLI for the default reader, default `claude` |
| `NUXT_MAIL_OPENMAIL_API_KEY` | OpenMail pod key. Empty: no inbound mail, no OpenMail sending |
| `NUXT_MAIL_OPENMAIL_POD_ID` | The pod whose outbound allowlist gets each approved recipient |
| `NUXT_MAIL_OPENMAIL_OWNER_ADDRESS` | The only sender whose forwards to an intake address count as instructions (DMARC-checked) |
| `NUXT_MAIL_OPENMAIL_MODEL` | Reader model, default `haiku` |
| `NUXT_MAIL_OPENMAIL_DIGEST_HOUR` | Local hour of the daily low-priority digest, default 8 |

## Routes

Owner (`requireOwner`): `GET /api/mail/drafts|sent|replies|summary|senders|addresses|inbound`,
`PATCH /api/mail/drafts/:id`, `POST /api/mail/drafts/:id/send|undo|discard|restore|revise|stop-revise|mark-sent`,
`GET /api/mail/threads/:draftId`, `POST /api/mail/replies/:id/read`, `POST|DELETE /api/mail/senders`,
`PATCH /api/mail/addresses/:id`, `GET /api/mail/inbound/:id`, `POST /api/mail/inbound/:id/draft|done`.

Agents (`requireAgent`): `GET|POST /api/internal/mail/drafts`, `POST /api/internal/mail/drafts/:id/revision`,
`GET /api/internal/mail/replies`, `POST /api/internal/mail/replies/:id/note`.

Request schemas and answers: `shared/types.ts`.

## How sending works

- States: draft, edited, revising, queued, sending, sent, failed, discarded, unknown. Every change
  goes through `transition(draft, action)`.
- Send stores an immutable snapshot of the reviewed revision and a `send_at` 10 s later. Any edit or
  Undo before then cancels it. The scheduler claims a due draft in one statement; after that it can
  no longer change. The snapshot is what goes out, never the live row.
- A send that throws may have delivered: the draft becomes "Delivery unknown" and is never retried
  on its own. The owner checks, then discards, marks as sent or sends again.
- Replies (IMAP or OpenMail) match the sent Message-ID, are stored once, and become one system note
  to the agent (marked untrusted) and one push.

## Develop

```bash
bun install
bun test                  # services on SQLite and Postgres (PGlite)
bun run typecheck         # lib + playground
bun run build:playground
bun run db:generate:sqlite && bun run db:generate:pg   # after a schema change: both, same change
```

A schema change needs the same change in `lib/rows.ts` and both schemas; the compile-time checks in
the schema files fail otherwise. Never edit a shipped migration: hosts have already run it.
