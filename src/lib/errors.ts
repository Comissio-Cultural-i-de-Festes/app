import { DbError } from './db'

/**
 * Which sentence a failure gets.
 *
 * The locale files have had an honest vocabulary since the first commit —
 * `errors.forbidden`, `errors.notFound`, `errors.offline`, `errors.rateLimited`
 * — and every screen was showing `errors.network` or `errors.generic` instead,
 * because nothing mapped a Postgres error code onto a sentence. So a member
 * whose session had lapsed was told the network was down, and someone in a
 * basement was told to try again as if trying again could work.
 *
 * The distinction is not cosmetic. Each of these leads somewhere different:
 * wait, sign in again, ask the junta, or stop.
 */
export function errorKey(error: unknown, online = navigator.onLine): string {
  if (!online) return 'errors.offline'

  if (error instanceof DbError) {
    // 42501 insufficient_privilege — a policy said no. Retrying never helps.
    if (error.code === '42501') return 'errors.forbidden'
    // Class 42 is the rest of privileges and undefined objects, 22 bad input,
    // 23 a constraint. A member can do nothing about any of them.
    if (/^(?:42|22|23)/.test(error.code)) return 'errors.generic'
    // PostgREST's own: no row where one was required, and its parse failures.
    if (error.code === 'PGRST116') return 'errors.notFound'
    // 202 is a function the schema cache does not have, 203 is one whose
    // arguments no longer match. Both mean the same thing in practice: the app
    // was deployed and the migrations were not. "Try again in a moment" is
    // advice that cannot ever work for it, and the person reading it is
    // usually the one who can fix it.
    if (error.code === 'PGRST202' || error.code === 'PGRST203') return 'errors.behindServer'
    if (error.code.startsWith('PGRST')) return 'errors.generic'
    if (error.code === '429') return 'errors.rateLimited'
  }

  // Anything else is a transport failure or a server that did not answer.
  return 'errors.network'
}
