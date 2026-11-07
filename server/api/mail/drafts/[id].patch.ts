import { mailHandler, mailId } from '../../../utils/mail-handler'
import { useMailService } from '../../../utils/mail-host'
import { editDraftSchema } from '../../../../shared/types'

export default mailHandler('owner', async event => {
  return useMailService().edit(mailId(event), await readValidatedBody(event, editDraftSchema.parse))
})
