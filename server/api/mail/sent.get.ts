import { mailHandler } from '../../utils/mail-handler'
import { useMailService } from '../../utils/mail-host'
import { draftsQuerySchema } from '../../../shared/types'

export default mailHandler('owner', async event => {
  return useMailService().listDrafts(await getValidatedQuery(event, draftsQuerySchema.parse), true)
})
