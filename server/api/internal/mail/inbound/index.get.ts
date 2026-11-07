import { mailHandler } from '../../../../utils/mail-handler'
import { requireMailInbound } from '../../../../utils/mail-host'
import { agentInboundQuerySchema } from '../../../../../shared/types'

// An agent reads the inbox: same views, rows and cap as GET /api/mail/inbound.
export default mailHandler('agent', async event => {
  const query = await getValidatedQuery(event, agentInboundQuerySchema.parse)
  const view = query.view ?? (query.done === '1' || query.done === 'true' ? 'all' : 'inbox')
  return requireMailInbound().agentList(query, { view, from: query.from || undefined })
})
