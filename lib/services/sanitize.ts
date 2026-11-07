// Turns an inbound mail into the plain text a human reader would see. Everything here is
// untrusted: hidden text is the usual place to put instructions meant for a model.

const MAX_LENGTH = 100_000

// Zero-width, bidi controls, soft hyphen, Unicode tags and variation selectors.
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu
const REMOVED_TAGS = 'head, script, style, template, noscript, title, svg, iframe, object'
const WHITE = /^(#fff|#ffffff|white|rgb\(255,255,255\)|rgba\(255,255,255,1\))$/

const styleValue = (style: string, name: string): string | undefined =>
  style.match(new RegExp(`(?:^|;)${name}:([^;]+)`))?.[1]?.replace(/!important$/, '')

const isHidden = (element: HTMLRewriterTypes.Element): boolean => {
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return true
  const style = (element.getAttribute('style') ?? '').toLowerCase().replace(/\s+/g, '')
  if (!style) return false
  if (/(?:^|;)(display:none|visibility:hidden|visibility:collapse)/.test(style)) return true
  if (/(?:^|;)opacity:0(\.0+)?(;|$|!)/.test(style)) return true
  const fontSize = styleValue(style, 'font-size')?.match(/^([\d.]+)(px|pt|em|rem|%)?$/)
  if (fontSize && Number(fontSize[1]) <= (fontSize[2] === 'em' || fontSize[2] === 'rem' ? 0.2 : 2)) return true
  if (/(?:^|;)(max-height|height|width|max-width):0(px)?(;|$)/.test(style) && /overflow:hidden/.test(style)) return true
  const color = styleValue(style, 'color')
  const background = styleValue(style, 'background-color') ?? styleValue(style, 'background')
  if (color && background && color === background) return true
  return Boolean(color && WHITE.test(color) && !background)
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', '#39': '\'' }
const decode = (text: string): string => text.replace(/&(#x[\da-f]+|#\d+|[a-z]+\d*);/gi, (all, name: string) => {
  if (name[0] === '#') {
    const code = name[1]?.toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1))
    return Number.isFinite(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : ''
  }
  return ENTITIES[name.toLowerCase()] ?? all
})

const htmlToText = (html: string): string => {
  const visible = new HTMLRewriter()
    .on(REMOVED_TAGS, { element: element => { element.remove() } })
    .on('*', { element: element => { if (isHidden(element)) element.remove() } })
    .onDocument({ comments: comment => { comment.remove() } })
    .transform(html)
  return decode(visible
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|tr|h[1-6]|blockquote|section|table)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ''))
}

const tidy = (text: string): string => text
  .replace(INVISIBLE, '')
  .replace(/\r\n?/g, '\n')
  .replace(/[ \t\f\v ]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim()
  .slice(0, MAX_LENGTH)

// The HTML part wins when present: a text part that differs from it is a known way to hide content.
export const sanitizeMail = (mail: { html?: string | null, text?: string | null }): string =>
  tidy(mail.html?.trim() ? htmlToText(mail.html) : mail.text ?? '')

// Clean a short untrusted header value (subject, sender name).
export const sanitizeLine = (value: string, max = 300): string => tidy(value).replace(/\s+/g, ' ').slice(0, max)

// Wraps untrusted text for a prompt. Any tag that looks like the delimiter is defused, so the
// data cannot end its own block and continue as instructions.
export const quoteForModel = (tag: string, text: string): string =>
  `<${tag}>\n${text.replace(new RegExp(`<\\s*/?\\s*${tag}\\s*>`, 'gi'), `[${tag}]`)}\n</${tag}>`
