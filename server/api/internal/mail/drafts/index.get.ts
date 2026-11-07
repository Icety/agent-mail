import { mailHandler } from '../../../../utils/mail-handler'
import { useMailService } from '../../../../utils/mail-host'
import { draftsQuerySchema } from '../../../../../shared/types'

export default mailHandler('agent', async event => {
  return useMailService().listAgentDrafts(await getValidatedQuery(event, draftsQuerySchema.parse))
})
