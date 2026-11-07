import { mailHandler } from '../../utils/mail-handler'
import { useMailInbound, useMailService } from '../../utils/mail-host'

export default mailHandler('owner', async () => {
  const service = useMailService()
  const summary = await service.summary()
  const inbound = useMailInbound()
  if (!inbound) return summary
  // The inbox on the home screen: waiting mail under "needs you", a slip into the inbox (with the
  // drafts waiting for the owner on it), the badge.
  const home = await inbound.home()
  summary.needs.unshift(...home.needs)
  const drafts = await service.reviewCount()
  if (drafts) home.slip.badges = [{ label: `${drafts} ${drafts === 1 ? 'draft' : 'drafts'} to review`, tone: 'mail' }, ...(home.slip.badges ?? [])]
  summary.slip = home.slip
  for (const badge of summary.badges) if (badge.nav === 'mail') badge.count += home.count
  return summary
})
