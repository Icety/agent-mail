import { mailHandler } from '../../../utils/mail-handler'
import { useMailInbound } from '../../../utils/mail-host'

export default mailHandler('owner', async () => useMailInbound()?.addresses() ?? [])
