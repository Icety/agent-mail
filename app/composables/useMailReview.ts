import { MailBatchReview } from '#components'

export interface MailReviewOptions {
  conversationId?: string | null
  agentId?: string | null
  // Review exactly these drafts, in this order (default: every draft waiting in the scope).
  draftIds?: string[]
  // Start at this draft.
  startId?: string
  // Second line of the header, e.g. "Priority 1 Dutch media · Outreach".
  subtitle?: string
}

// Batch review from anywhere: fullscreen on a phone, a modal on desktop.
// useMailReview().open({ conversationId }) or open({ agentId }).
export const useMailReview = () => {
  const overlay = useOverlay()
  return {
    open: async (options: MailReviewOptions): Promise<void> => {
      const review = overlay.create(MailBatchReview, { destroyOnClose: true })
      await review.open({ ...options })
    },
  }
}
