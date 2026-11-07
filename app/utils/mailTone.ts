// The colour language of the mail screens. Class strings are written out in full so Tailwind finds
// them; colours come from app/assets/mail.css.

export const MAIL_TONES = ['neutral', 'mail', 'ok', 'reply', 'warn', 'error'] as const
export type MailUiTone = typeof MAIL_TONES[number]

export interface MailToneClasses {
  solid: string
  soft: string
  text: string
  css: string
}

const TABLE: Record<MailUiTone, MailToneClasses> = {
  neutral: { solid: 'bg-mail-action text-mail-on-action', soft: 'bg-mail-inset text-mail-ink-2', text: 'text-mail-ink-2', css: 'var(--color-mail-ink-4)' },
  mail: { solid: 'bg-mail-accent-fill text-mail-on-fill', soft: 'bg-mail-accent-tint text-mail-accent-deep', text: 'text-mail-accent-deep', css: 'var(--color-mail-accent-fill)' },
  ok: { solid: 'bg-mail-ok-fill text-mail-on-fill', soft: 'bg-mail-ok-tint text-mail-ok-deep', text: 'text-mail-ok-deep', css: 'var(--color-mail-ok-fill)' },
  reply: { solid: 'bg-mail-warn-fill text-mail-on-fill', soft: 'bg-mail-warn-tint text-mail-warn-deep', text: 'text-mail-warn-deep', css: 'var(--color-mail-warn-fill)' },
  warn: { solid: 'bg-mail-warn-fill text-mail-on-fill', soft: 'bg-mail-warn-tint text-mail-warn-deep', text: 'text-mail-warn-deep', css: 'var(--color-mail-warn-fill)' },
  error: { solid: 'bg-mail-err-fill text-mail-on-fill', soft: 'bg-mail-err-tint text-mail-err-deep', text: 'text-mail-err-deep', css: 'var(--color-mail-err-fill)' },
}

export const mailToneClasses = (tone: MailUiTone | undefined): MailToneClasses => TABLE[tone ?? 'neutral'] ?? TABLE.neutral
