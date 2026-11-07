import { mailHandler } from '../../../utils/mail-handler'
import { useMailInbound } from '../../../utils/mail-host'
import { inboundQuerySchema } from '../../../../shared/types'

export default mailHandler('owner', async event => {
  const query = await getValidatedQuery(event, inboundQuerySchema.parse)
  return (await useMailInbound()?.list(Boolean(query.done))) ?? []
})
