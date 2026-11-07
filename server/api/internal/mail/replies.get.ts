import { mailHandler } from '../../../utils/mail-handler'
import { useMailService } from '../../../utils/mail-host'
import { repliesQuerySchema } from '../../../../shared/types'

export default mailHandler('agent', async event => {
  return useMailService().listAgentReplies(await getValidatedQuery(event, repliesQuerySchema.parse))
})
