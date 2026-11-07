import { mailHandler } from '../../../utils/mail-handler'
import { useMailService } from '../../../utils/mail-host'
import { draftsQuerySchema } from '../../../../shared/types'

export default mailHandler('owner', async event => {
  const query = await getValidatedQuery(event, draftsQuerySchema.parse)
  return useMailService().listSenders(query.agent)
})
