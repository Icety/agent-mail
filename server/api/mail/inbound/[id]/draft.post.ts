import { mailHandler, mailId } from '../../../../utils/mail-handler'
import { requireMailInbound } from '../../../../utils/mail-host'
import { draftReplySchema } from '../../../../../shared/types'

// Only the owner starts a reply; agents have no route to inbound mail.
export default mailHandler('owner', async event => {
  const input = await readValidatedBody(event, draftReplySchema.parse)
  return requireMailInbound().draftReply(mailId(event), input.instruction)
})
