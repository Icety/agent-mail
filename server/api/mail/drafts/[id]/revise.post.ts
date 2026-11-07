import { mailHandler, mailId } from '../../../../utils/mail-handler'
import { useMailService } from '../../../../utils/mail-host'
import { reviseDraftSchema } from '../../../../../shared/types'

export default mailHandler('owner', async event => {
  const input = await readValidatedBody(event, reviseDraftSchema.parse)
  return useMailService().revise(mailId(event), input.note)
})
