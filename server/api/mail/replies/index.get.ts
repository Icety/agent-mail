import { mailHandler } from '../../../utils/mail-handler'
import { useMailService } from '../../../utils/mail-host'
import { repliesQuerySchema } from '../../../../shared/types'

export default mailHandler('owner', async event => {
  return useMailService().listReplies(await getValidatedQuery(event, repliesQuerySchema.parse))
})
