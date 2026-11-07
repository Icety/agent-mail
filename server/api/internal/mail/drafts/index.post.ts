import { mailHandler } from '../../../../utils/mail-handler'
import { useMailService } from '../../../../utils/mail-host'
import { createDraftSchema } from '../../../../../shared/types'

export default mailHandler('agent', async event => {
  return useMailService().createDraft(await readValidatedBody(event, createDraftSchema.parse))
})
