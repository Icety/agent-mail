import type { MaybeRefOrGetter } from 'vue'
import type { MailDraft, MailReply, MailSender } from '../../shared/types'
import { MAIL_OFFLINE_LOAD, mailErrorMessage, mailErrorStatus, mailHttpApi, type MailApi, type MailEdit } from '../utils/mailApi'
import { createMailDemoApi } from '../utils/mailDemoApi'
import { isMailReviewable, mailNewer, mailRecipientName, mailSecondsLeft, mailWindowSeconds, type MailScope } from '../utils/mailView'

// One client cache of every draft and reply a screen has seen, so a card in a chat, the mail
// panel and the batch review always show the same state. Lists keep ids; the objects live here.
const store = reactive({
  drafts: {} as Record<string, MailDraft>,
  replies: {} as Record<string, MailReply>,
})

export const upsertMailDrafts = (drafts: MailDraft[]): void => {
  for (const d of drafts) store.drafts[d.id] = mailNewer(store.drafts[d.id], d)
}
const upsertReplies = (replies: MailReply[]): void => {
  for (const r of replies) store.replies[r.id] = r
}

// The demo API (style page only) replaces the server while it is on.
const demo = shallowRef<MailApi | null>(null)
export const useMailDemo = () => ({
  start: (seed: Parameters<typeof createMailDemoApi>[0]) => {
    demo.value = createMailDemoApi(seed, d => upsertMailDrafts([d]))
    forgetSenders()
  },
  stop: () => {
    demo.value = null
    forgetSenders()
  },
})

export const useMailApi = (): MailApi => demo.value ?? mailHttpApi

// The current state of a draft: the cached copy when it is newer than the one passed in.
// Reactive when read inside a computed or a template.
export const currentMailDraft = (draft: MailDraft): MailDraft => mailNewer(store.drafts[draft.id], draft)
export const mailCachedDraft = (id: string): MailDraft | undefined => store.drafts[id]
export const useMailDraft = (draft: MaybeRefOrGetter<MailDraft>) => computed(() => currentMailDraft(toValue(draft)))

// A clock for countdowns, ticking only while something shows one.
const now = ref(Date.now())
let tickers = 0
let tick: ReturnType<typeof setInterval> | undefined
export const useMailNow = () => {
  if (tickers++ === 0) tick = setInterval(() => { now.value = Date.now() }, 250)
  onScopeDispose(() => {
    if (--tickers === 0) clearInterval(tick)
  })
  return readonly(now)
}

export type MailLoadState = 'loading' | 'ready' | 'error'

// Drafts, sent mail and replies of one conversation, one agent, or everything (empty scope).
// Refetches on the live topics and when a queued send is due.
export const useMail = (scope: MaybeRefOrGetter<MailScope>, options: { live?: boolean } = {}) => {
  const api = () => useMailApi()
  const ids = shallowRef<{ drafts: string[], replies: string[] }>({ drafts: [], replies: [] })
  const state = ref<MailLoadState>('loading')
  const slow = ref(false)
  const error = ref<string | null>(null)

  let running: Promise<void> | null = null
  let again = false
  let slowTimer: ReturnType<typeof setTimeout> | undefined

  const load = async () => {
    const s = { ...toValue(scope) }
    try {
      const [drafts, sent, replies] = await Promise.all([api().drafts(s), api().sent(s), api().replies(s)])
      upsertMailDrafts([...drafts, ...sent])
      upsertReplies(replies)
      ids.value = { drafts: [...drafts, ...sent].map(d => d.id), replies: replies.map(r => r.id) }
      state.value = 'ready'
      error.value = null
    }
    catch (err) {
      console.error('[mail] load failed', toValue(scope), err)
      error.value = mailErrorMessage(err, MAIL_OFFLINE_LOAD)
      if (state.value !== 'ready') state.value = 'error'
    }
  }

  const refresh = async (): Promise<void> => {
    if (running) {
      again = true
      return running
    }
    clearTimeout(slowTimer)
    slow.value = false
    slowTimer = setTimeout(() => { slow.value = true }, 8_000)
    running = (async () => {
      do {
        again = false
        await load()
      } while (again)
    })().finally(() => {
      running = null
      clearTimeout(slowTimer)
      slow.value = false
    })
    return running
  }

  const retry = () => {
    state.value = 'loading'
    return refresh()
  }

  watch(() => JSON.stringify(toValue(scope)), () => { void refresh() }, { immediate: true })

  const all = computed(() => ids.value.drafts.map(id => store.drafts[id]).filter((d): d is MailDraft => Boolean(d)))
  const byCreated = (a: MailDraft, b: MailDraft) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
  // Everything not sent and not thrown away: waiting, queued, being revised, failed, unknown.
  const drafts = computed(() => all.value.filter(d => d.state !== 'sent' && d.state !== 'discarded').sort(byCreated))
  const reviewable = computed(() => drafts.value.filter(isMailReviewable))
  const queued = computed(() => drafts.value.filter(d => d.state === 'queued' || d.state === 'sending'))
  const discarded = computed(() => all.value.filter(d => d.state === 'discarded').sort(byCreated))
  const sent = computed(() => all.value.filter(d => d.state === 'sent'))
  const replies = computed(() => ids.value.replies.map(id => store.replies[id]).filter((r): r is MailReply => Boolean(r))
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt)))
  const unread = computed(() => replies.value.filter(r => !r.readAt))

  if (options.live !== false) {
    useMailLive('mail.draft', (data) => {
      const conversationId = toValue(scope).conversationId
      if (!data || !conversationId || data.conversationId === conversationId) void refresh()
    })
    useMailLive('mail.reply', () => { void refresh() })
  }

  // A queued send is due: check how it went, even if the live event got lost.
  let dueTimer: ReturnType<typeof setTimeout> | undefined
  watch(queued, (list) => {
    clearTimeout(dueTimer)
    const due = list.map(d => Date.parse(d.sendAt ?? '')).filter(Number.isFinite)
    if (due.length === 0) return
    dueTimer = setTimeout(() => { void refresh() }, Math.max(0, Math.min(...due) - Date.now()) + 2_500)
  })
  onScopeDispose(() => {
    clearTimeout(dueTimer)
    clearTimeout(slowTimer)
  })

  return { state, slow, error, refresh, retry, all, drafts, reviewable, queued, discarded, sent, replies, unread }
}

// Sender addresses per agent: one cache for the From picker, the editor and MailSendersEditor.
// Loaded once per agent, retried after a failure, reloaded after every change.
interface SenderSlot { list: MailSender[], state: MailLoadState, error: string | null }
const senderSlots = reactive<Record<string, SenderSlot>>({})
const senderLoads = new Map<string, Promise<void>>()
const forgetSenders = () => {
  for (const id of Object.keys(senderSlots)) delete senderSlots[id]
}

const loadSenders = (agentId: string, force = false): Promise<void> => {
  if (!senderSlots[agentId]) senderSlots[agentId] = { list: [], state: 'loading', error: null }
  // Read back through the reactive record, so the writes below update the screens.
  const slot = senderSlots[agentId]!
  if (!force && slot.state === 'ready') return Promise.resolve()
  const running = senderLoads.get(agentId)
  if (running) return running
  const load = (async () => {
    try {
      slot.list = await useMailApi().senders(agentId)
      slot.state = 'ready'
      slot.error = null
    }
    catch (err) {
      console.error('[mail] senders failed', agentId, err)
      slot.error = mailErrorMessage(err, 'You are offline. The addresses load when you are back.')
      if (slot.state !== 'ready') slot.state = 'error'
    }
    finally {
      senderLoads.delete(agentId)
    }
  })()
  senderLoads.set(agentId, load)
  return load
}

export const useMailSenders = (agentId: MaybeRefOrGetter<string>) => {
  watch(() => toValue(agentId), (id) => {
    if (id && senderSlots[id]?.state !== 'ready') void loadSenders(id)
  }, { immediate: true })

  const slot = computed<SenderSlot>(() => senderSlots[toValue(agentId)] ?? { list: [], state: 'loading', error: null })
  const senders = computed(() => slot.value.list)
  const state = computed(() => slot.value.state)
  const error = computed(() => slot.value.error)

  // Every change reloads the list, so the server's rules (one default per agent) show up as-is.
  const change = async (fn: () => Promise<unknown>) => {
    const id = toValue(agentId)
    try {
      await fn()
    }
    finally {
      await loadSenders(id, true)
    }
  }

  return {
    senders,
    state,
    error,
    reload: () => loadSenders(toValue(agentId), true),
    add: (input: { name: string, address: string, isDefault?: boolean }) =>
      change(() => useMailApi().saveSender({ agentId: toValue(agentId), ...input })),
    setDefault: (sender: MailSender) =>
      change(() => useMailApi().saveSender({ agentId: sender.agentId, address: sender.address, name: sender.name, isDefault: true })),
    remove: (sender: MailSender) => change(() => useMailApi().removeSender(sender.id)),
  }
}

// One sent mail with its replies. Unread replies are marked read once shown. Only the answer to
// the latest request counts, so switching threads never shows or marks another thread's replies.
export const useMailThread = (draftId: MaybeRefOrGetter<string>) => {
  const state = ref<MailLoadState>('loading')
  const error = ref<string | null>(null)
  const replyIds = shallowRef<string[]>([])
  let generation = 0

  const load = async () => {
    const id = toValue(draftId)
    const mine = ++generation
    try {
      const thread = await useMailApi().thread(id)
      if (mine !== generation) return
      upsertMailDrafts([thread.draft])
      upsertReplies(thread.replies)
      replyIds.value = thread.replies.map(r => r.id)
      state.value = 'ready'
      error.value = null
      for (const reply of thread.replies.filter(r => !r.readAt)) {
        useMailApi().markRead(reply.id).then(r => upsertReplies([r])).catch(err => console.error('[mail] mark read failed', reply.id, err))
      }
    }
    catch (err) {
      if (mine !== generation) return
      console.error('[mail] thread failed', id, err)
      error.value = mailErrorMessage(err, MAIL_OFFLINE_LOAD)
      state.value = 'error'
    }
  }
  watch(() => toValue(draftId), () => {
    state.value = 'loading'
    replyIds.value = []
    void load()
  }, { immediate: true })
  useMailLive('mail.reply', (data) => {
    if (!data || data.draftId === toValue(draftId)) void load()
  })
  onScopeDispose(() => { generation++ })

  const draft = computed(() => store.drafts[toValue(draftId)])
  const replies = computed(() => replyIds.value.map(id => store.replies[id]).filter((r): r is MailReply => Boolean(r))
    .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt)))
  return { state, error, draft, replies, retry: load }
}

// The answer to saving an edit made on top of `revision`.
export type MailSaveResult =
  | { ok: true, draft: MailDraft }
  | { ok: false, conflict: boolean, message: string }

// Everything the owner does to a draft. Each answer updates the cache; a stale revision refetches
// the draft and says so.
export const useMailActions = () => {
  const toast = useToast()
  const { isPhone: phone } = useMailViewport()

  const latest = async (id: string): Promise<MailDraft | null> => {
    try {
      const draft = (await useMailApi().thread(id)).draft
      upsertMailDrafts([draft])
      return draft
    }
    catch (err) {
      console.error('[mail] reload failed', id, err)
      return null
    }
  }

  const run = async (draft: MailDraft, title: string, fn: () => Promise<MailDraft>): Promise<MailDraft | null> => {
    try {
      const next = await fn()
      upsertMailDrafts([next])
      return next
    }
    catch (err) {
      console.error(`[mail] ${title}`, draft.id, err)
      const stale = mailErrorStatus(err) === 409
      toast.add({
        title: stale ? 'This draft changed' : title,
        description: stale ? 'Showing the latest version. Check it, then try again.' : mailErrorMessage(err),
        color: stale ? 'warning' : 'error',
        icon: stale ? 'i-lucide-refresh-cw' : 'i-lucide-circle-alert',
      })
      if (stale) await latest(draft.id)
      return null
    }
  }

  // The "Sending to X in 10 s" echo goes away once the draft is no longer queued (Undo anywhere,
  // an edit, or the send itself).
  const sendToastId = (id: string) => `mail-send-${id}`
  const dismissWhenDone = (id: string) => {
    const stop = watch(() => store.drafts[id]?.state, (state) => {
      if (state === 'queued') return
      toast.remove(sendToastId(id))
      stop()
    })
    setTimeout(stop, 120_000)
  }

  const undo = (draft: MailDraft) => run(draft, 'Could not undo', () => useMailApi().act(draft.id, 'undo'))
    .then((next) => {
      if (next) toast.remove(sendToastId(draft.id))
      if (next && !phone.value) toast.add({ title: 'Back in drafts', description: `Not sent to ${mailRecipientName(draft)}.`, icon: 'i-lucide-undo-2' })
      return next
    })

  // Authorises exactly this revision. The toast only echoes; the card and the queue strip own Undo.
  const send = (draft: MailDraft, options: { toast?: boolean } = {}) => run(draft, 'Not queued', () => useMailApi().act(draft.id, 'send', { revision: draft.revision }))
    .then((next) => {
      // On a phone the card's own countdown is in view and a toast would cover the composer.
      if (next && (options.toast ?? !phone.value)) {
        toast.add({
          id: sendToastId(next.id),
          title: `Sending to ${mailRecipientName(draft)} in ${mailSecondsLeft(next.sendAt, Date.now()) || mailWindowSeconds(next)} s`,
          description: 'Queued, not sent yet.',
          icon: 'i-lucide-clock',
          actions: [{ label: 'Undo', icon: 'i-lucide-undo-2', color: 'neutral', variant: 'outline', onClick: () => { void undo(next) } }],
        })
        dismissWhenDone(next.id)
      }
      return next
    })

  // Saves fields edited on top of `revision` (what the editor started from). A conflict is
  // returned, not toasted: the editor keeps the text and lets the owner choose.
  const saveEdit = async (draftId: string, revision: number, edit: Omit<MailEdit, 'revision'>): Promise<MailSaveResult> => {
    try {
      const next = await useMailApi().edit(draftId, { ...edit, revision })
      upsertMailDrafts([next])
      return { ok: true, draft: next }
    }
    catch (err) {
      console.error('[mail] edit failed', draftId, revision, err)
      return { ok: false, conflict: mailErrorStatus(err) === 409, message: mailErrorMessage(err) }
    }
  }

  return {
    send,
    undo,
    saveEdit,
    latest,
    discard: (draft: MailDraft) => run(draft, 'Could not discard', () => useMailApi().act(draft.id, 'discard')),
    restore: (draft: MailDraft) => run(draft, 'Could not restore', () => useMailApi().act(draft.id, 'restore')),
    revise: (draft: MailDraft, note: string) => run(draft, 'Could not ask the agent', () => useMailApi().act(draft.id, 'revise', { note })),
    stopRevise: (draft: MailDraft) => run(draft, 'Could not stop', () => useMailApi().act(draft.id, 'stop-revise')),
    markSent: (draft: MailDraft) => run(draft, 'Could not mark as sent', () => useMailApi().act(draft.id, 'mark-sent')),
    edit: (draft: MailDraft, edit: Omit<MailEdit, 'revision'>) => run(draft, 'Not saved', () => useMailApi().edit(draft.id, { ...edit, revision: draft.revision })),
  }
}
