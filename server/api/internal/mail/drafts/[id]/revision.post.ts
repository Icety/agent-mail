import { mailHandler, mailId } from '../../../../../utils/mail-handler'
import { useMailService } from '../../../../../utils/mail-host'
import { agentRevisionSchema } from '../../../../../../shared/types'

export default mailHandler('agent', async event => {
  return useMailService().agentRevision(mailId(event), await readValidatedBody(event, agentRevisionSchema.parse))
})
