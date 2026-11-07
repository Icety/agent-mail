import { createError, defineEventHandler, getRouterParam, type H3Event } from 'h3'
import { MailError } from '../../lib/services/mail'
import { InboundError } from '../../lib/services/inbound'
import { useMailHost } from './mail-host'

export const mailId = (event: H3Event, name = 'id'): string => {
  const id = getRouterParam(event, name)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing mail id' })
  return id
}

// Every mail route names who may call it; the host decides how that is checked. Owner: the
// person's login. Agent: the internal token. Mail and inbound errors become their HTTP status.
export const mailHandler = <T>(caller: 'owner' | 'agent', handler: (event: H3Event) => T | Promise<T>) => defineEventHandler(async event => {
  const host = useMailHost()
  await (caller === 'owner' ? host.requireOwner(event) : host.requireAgent(event))
  try { return await handler(event) }
  catch (error) {
    if (error instanceof MailError || error instanceof InboundError) throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    throw error
  }
})
