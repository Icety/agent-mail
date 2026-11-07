import { mailHandler, mailId } from '../../../../utils/mail-handler'
import { requireMailInbound } from '../../../../utils/mail-host'

export default mailHandler('owner', async event => {
  return requireMailInbound().markDone(mailId(event))
})
