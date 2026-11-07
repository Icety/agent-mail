import type { MailDraft } from '../../shared/types'
import { MailEditSheet } from '#components'

// Open the draft editor from anywhere: await useMailEditor().open(draft) -> saved or not.
export const useMailEditor = () => {
  const overlay = useOverlay()
  return {
    open: async (draft: MailDraft): Promise<boolean> => {
      const sheet = overlay.create(MailEditSheet, { destroyOnClose: true })
      return Boolean(await sheet.open({ draft }))
    },
  }
}
