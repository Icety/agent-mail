import { mailHandler } from '../../../utils/mail-handler'
import { useMailService } from '../../../utils/mail-host'
import { senderSchema } from '../../../../shared/types'

export default mailHandler('owner', async event => {
  return useMailService().saveSender(await readValidatedBody(event, senderSchema.parse))
})
