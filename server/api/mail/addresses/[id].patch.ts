import { mailHandler, mailId } from '../../../utils/mail-handler'
import { requireMailInbound } from '../../../utils/mail-host'
import { addressSchema } from '../../../../shared/types'

export default mailHandler('owner', async event => {
  return requireMailInbound().patchAddress(mailId(event), await readValidatedBody(event, addressSchema.parse))
})
