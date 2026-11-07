// Agent mail as a Nuxt layer: routes under /api/mail (owner) and /api/internal/mail (agents),
// pages under /mail, and the Mail* components. The host app calls defineMailHost from a Nitro
// plugin and provides `mailHost` from a client plugin. See README.md.
export default defineNuxtConfig({
  runtimeConfig: {
    mail: {
      // NUXT_MAIL_SMTP_URL, e.g. smtps://user:pass@smtp.example.com. Empty: the log transport,
      // which never sends and marks drafts "Simulated".
      smtpUrl: '',
      // NUXT_MAIL_IMAP_URL, e.g. imaps://user:pass@imap.example.com. Empty: no reply polling.
      imapUrl: '',
      // NUXT_MAIL_SEND_DELAY_SECONDS: the undo window between Send and the real send (minimum 10).
      sendDelaySeconds: 10,
      // NUXT_MAIL_CLAUDE_BIN: the Claude Code CLI the default inbound reader runs.
      claudeBin: '',
      // Inbound and outbound mail on OpenMail (https://openmail.sh). Empty apiKey: off.
      openmail: {
        // NUXT_MAIL_OPENMAIL_API_KEY: a pod key (pod-scoped, never the account key).
        apiKey: '',
        baseUrl: 'https://api.openmail.sh',
        wsUrl: 'wss://api.openmail.sh/v1/ws',
        // NUXT_MAIL_OPENMAIL_POD_ID: the pod whose outbound allowlist gets the approved recipients.
        podId: '',
        // NUXT_MAIL_OPENMAIL_OWNER_ADDRESS: the only sender whose forwards to the intake address
        // count as instructions (DMARC-checked).
        ownerAddress: '',
        // Model for the tool-less reader that classifies, summarizes and drafts.
        model: 'haiku',
        // Local hour of the daily digest of low-priority mail.
        digestHour: 8,
      },
    },
  },
})
