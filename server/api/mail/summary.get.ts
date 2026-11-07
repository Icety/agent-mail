import { mailHandler } from '../../utils/mail-handler'
import { useMailHost, useMailInbound, useMailService } from '../../utils/mail-host'

export default mailHandler('owner', async () => {
  const summary = await useMailService().summary()
  const inbound = useMailInbound()
  if (!inbound) return summary
  const { links } = useMailHost()
  // New mail the owner has not answered or finished counts as "needs you". Noise waits for the digest.
  const waiting = (await inbound.list(false)).filter(mail => mail.status === 'handled' && mail.category !== 'noise' && !mail.drafts.length)
  summary.needs.unshift(...waiting.slice(0, 5).map(mail => ({
    id: `inbound:${mail.id}`, tone: 'mail' as const, icon: 'i-lucide-inbox',
    title: `${mail.category === 'owner' ? 'Mail for you' : 'New mail'} from ${mail.fromName || mail.fromAddress}`,
    detail: mail.subject, action: { label: 'Open', to: links.inbound(mail.id) },
  })))
  for (const badge of summary.badges) if (badge.nav === 'mail') badge.count += waiting.length
  return summary
})
