// Times are stored in UTC and always shown in Amsterdam time, whatever the device's zone
// (every current host is Dutch). Copied from Koopa's ui layer; named mail* to avoid auto-import clashes.
const TZ = 'Europe/Amsterdam'
const LOCALE = 'en-GB'

export type MailTimeFormat = 'time' | 'short' | 'day' | 'date' | 'relative'

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, ...options })
const TIME = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const DAY = fmt({ weekday: 'short', day: 'numeric', month: 'short' })
const DATE = fmt({ weekday: 'long', day: 'numeric', month: 'long' })
const WEEKDAY = fmt({ weekday: 'short' })
const SHORT = fmt({ day: 'numeric', month: 'short' })
const SHORT_YEAR = fmt({ day: 'numeric', month: 'short', year: 'numeric' })
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

// Whole calendar days between two instants, counted on Amsterdam's calendar (DST-safe).
const amsterdamDayDiff = (from: Date, to: Date): number => {
  const day = (d: Date) => Date.parse(`${DAY_KEY.format(d)}T00:00:00Z`)
  return Math.round((day(to) - day(from)) / 86_400_000)
}

const relative = (date: Date, now: Date): string => {
  const minutes = Math.round((date.getTime() - now.getTime()) / 60_000)
  if (Math.abs(minutes) < 1) return 'just now'
  if (minutes < 0 && minutes > -60) return `${-minutes}m ago`
  if (minutes > 0 && minutes < 60) return `in ${minutes}m`

  const days = amsterdamDayDiff(now, date)
  if (days === 0) return TIME.format(date)
  if (days === -1) return 'Yesterday'
  if (days === 1) return 'Tomorrow'
  if (days < 0 && days > -7) return WEEKDAY.format(date)
  return DAY_KEY.format(date).slice(0, 4) === DAY_KEY.format(now).slice(0, 4) ? SHORT.format(date) : SHORT_YEAR.format(date)
}

/**
 * - time: "14:02"
 * - short: "14:02" (same day), else "17 Oct"
 * - day: "Sat 17 Oct"
 * - date: "Thursday 15 October"
 * - relative: "just now", "5m ago", "in 8m", "14:02" (same day), "Yesterday", "Tue" (this week), "17 Oct", "17 Oct 2025"
 * Returns an empty string for an invalid timestamp.
 */
export const formatMailTime = (iso: string | Date, format: MailTimeFormat, now: Date = new Date()): string => {
  const date = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  if (format === 'time') return TIME.format(date)
  if (format === 'short') return amsterdamDayDiff(now, date) === 0 ? TIME.format(date) : SHORT.format(date)
  if (format === 'day') return DAY.format(date).replace(',', '')
  if (format === 'date') return DATE.format(date).replace(',', '')
  return relative(date, now)
}

// Calendar days ("YYYY-MM-DD", date-only values like a workout or a briefing date) are not
// instants: they read the same everywhere, so they are formatted at UTC noon, never shifted.
