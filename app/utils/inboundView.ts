import type { MailUiTone } from './mailTone'
import type { AddressKind, IncomingMail } from '../../shared/types'

export const categoryPill = (mail: Pick<IncomingMail, 'category' | 'status' | 'trusted'>): { label: string, tone: MailUiTone } => {
  if (mail.status === 'done') return { label: 'Done', tone: 'neutral' }
  if (mail.status === 'received') return { label: 'Reading', tone: 'ok' }
  switch (mail.category) {
    case 'owner': return { label: 'For you', tone: 'reply' }
    case 'intake': return { label: mail.trusted ? 'Your forward' : 'Unverified forward', tone: mail.trusted ? 'ok' : 'warn' }
    case 'noise': return { label: 'Low priority', tone: 'neutral' }
    default: return { label: 'Project', tone: 'mail' }
  }
}

export const ADDRESS_KIND_LABELS: Record<AddressKind, string> = {
  'owner': 'For you',
  'project': 'Project',
  'intake': 'Your forwards',
  'reports': 'Reports (digest only)',
}

export const domainOf = (address: string): string => address.split('@')[1] ?? address
