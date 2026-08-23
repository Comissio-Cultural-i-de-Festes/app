import type { CheckInStatus } from '@/design/states'
import { unwrapAs } from '@/lib/db'
import type { Escola } from '@/lib/model'
import { type QueuedScan, bumpTries, dequeue, enqueue, pending } from '@/lib/queue'
import { supabase } from '@/lib/supabase'

/**
 * The door.
 *
 * Everything here goes through `check_in`, which is idempotent on
 * `client_request_id`: the same id sent twice grants points once and reports
 * what it reported the first time. That is what makes an offline queue safe to
 * resend, and it is enforced by a partial unique index rather than by
 * anything in this file.
 */

export interface CheckInResult {
  readonly status: CheckInStatus
  readonly replayed?: boolean
  readonly user_id?: string
  readonly nombre?: string
  readonly escola?: Escola | null
  readonly curs?: number | null
  readonly pagado?: boolean
  readonly was_registered?: boolean
  readonly points_awarded?: number
  readonly checked_in_at?: string
}

export interface RosterRow {
  readonly user_id: string
  readonly nombre: string
  readonly escola: Escola | null
  readonly curs: number | null
  readonly estado: string | null
  readonly pagado: boolean | null
  readonly checked_in: boolean
}

export const doorKeys = {
  roster: (eventId: string) => ['door', 'roster', eventId] as const,
  pointValues: () => ['junta', 'pointValues'] as const,
}

export interface ScanRequest {
  readonly clientRequestId: string
  readonly eventId: string
  readonly qrToken: string | null
  readonly userId: string | null
}

export async function checkIn(request: ScanRequest): Promise<CheckInResult> {
  const { data, error } = await supabase.rpc('check_in', {
    p_event_id: request.eventId,
    p_client_request_id: request.clientRequestId,
    ...(request.qrToken === null ? {} : { p_qr_token: request.qrToken }),
    ...(request.userId === null ? {} : { p_user_id: request.userId }),
  })
  if (error) throw error
  return data as unknown as CheckInResult
}

/**
 * Everybody who could walk through this door.
 *
 * A non-admin gets zero rows rather than an error, which is a trap worth
 * naming: an empty list here can mean "nobody is coming" or "you are not
 * allowed to ask", and the screen must not read the second as the first.
 */
export async function fetchRoster(eventId: string): Promise<RosterRow[]> {
  return unwrapAs<RosterRow[]>(supabase.rpc('checkin_roster', { p_event_id: eventId }).select('*'))
}

/**
 * A scan, whether or not there is any signal.
 *
 * The queue is written first and cleared on success, rather than being a
 * fallback after a failure: a request that times out after thirty seconds
 * would otherwise be lost between the two.
 */
export async function scan(request: ScanRequest): Promise<CheckInResult> {
  const queued: QueuedScan = {
    clientRequestId: request.clientRequestId,
    eventId: request.eventId,
    qrToken: request.qrToken,
    userId: request.userId,
    at: Date.now(),
    tries: 0,
  }
  await enqueue(queued)

  try {
    const result = await checkIn(request)
    await dequeue(request.clientRequestId)
    return result
  } catch (cause) {
    // Left in the queue on purpose. The person in front of you goes in either
    // way; the row catches up when the signal does.
    await bumpTries(queued)
    throw cause
  }
}

/**
 * What happened when somebody was let in.
 *
 * `queued` is not a failure. The person walked through the door; only the row
 * is late. Telling the junta to "try again" there would be advice that makes
 * things worse, so it is its own outcome with its own words.
 */
export type DoorOutcome =
  | { readonly kind: 'sent'; readonly result: CheckInResult }
  | { readonly kind: 'queued' }
  | { readonly kind: 'failed' }

/** Which of the two a thrown scan was. Offline is the queue working. */
export function outcomeFromFailure(): DoorOutcome {
  return navigator.onLine ? { kind: 'failed' } : { kind: 'queued' }
}

export interface FlushOutcome {
  readonly sent: number
  readonly left: number
}

/** Sends whatever is waiting. Stops at the first failure rather than hammering. */
export async function flushQueue(): Promise<FlushOutcome> {
  const waiting = await pending()
  let sent = 0

  for (const item of waiting) {
    try {
      await checkIn(item)
      await dequeue(item.clientRequestId)
      sent += 1
    } catch {
      await bumpTries(item)
      break
    }
  }

  return { sent, left: waiting.length - sent }
}

export async function awardPoints(
  userIds: readonly string[],
  eventId: string,
  motivo: string,
  puntos: number,
): Promise<void> {
  // One call each rather than one call with an array: award_points is the
  // audited unit, and a partial failure that has already credited four people
  // must leave those four credited.
  for (const userId of userIds) {
    const { error } = await supabase.rpc('award_points', {
      p_user_id: userId,
      p_event_id: eventId,
      p_motivo: motivo,
      p_puntos: puntos,
    })
    if (error) throw error
  }
}
