import { mailHandler, mailId } from '../../../../../utils/mail-handler'
import { requireMailInbound } from '../../../../../utils/mail-host'
import { agentInboundDoneSchema } from '../../../../../../shared/types'

// An agent closes a mail, like the owner does in the app; the audit line says which agent.
export default mailHandler('agent', async event => {
  return requireMailInbound().agentMarkDone(mailId(event), await readValidatedBody(event, agentInboundDoneSchema.parse))
})
