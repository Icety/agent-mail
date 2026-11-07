import { mailHandler, mailId } from '../../../../../utils/mail-handler'
import { useMailService } from '../../../../../utils/mail-host'
import { replyNoteSchema } from '../../../../../../shared/types'

export default mailHandler('agent', async event => {
  const input = await readValidatedBody(event, replyNoteSchema.parse)
  return useMailService().noteReply(mailId(event), input.note)
})
