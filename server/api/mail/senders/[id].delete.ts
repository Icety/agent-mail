import { mailHandler, mailId } from '../../../utils/mail-handler'
import { useMailService } from '../../../utils/mail-host'

export default mailHandler('owner', async event => {
  return useMailService().deleteSender(mailId(event))
})
