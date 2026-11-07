import { mailHandler, mailId } from '../../../../utils/mail-handler'
import { useMailService } from '../../../../utils/mail-host'
import { sendDraftSchema } from '../../../../../shared/types'

export default mailHandler('owner', async event => {
  const input = await readValidatedBody(event, sendDraftSchema.parse)
  return useMailService().queue(mailId(event), input.revision)
})
