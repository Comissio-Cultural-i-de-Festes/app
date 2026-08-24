import { type CheckInStatus, SCAN_PRESENTATION, type ScanPresentation } from '@/design/states'
import { DbError, unwrapAs } from '@/lib/db'
import type { Escola } from '@/lib/model'
import { type QueuedScan, bumpTries, dequeue, enqueue, pending } from '@/lib/queue'
import { DOOR_PHOTOS, uploadDoorPhoto } from '@/lib/storage'
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
  if (error) throw new DbError(error)
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
 *
 * Every outcome carries the request that produced it. Undoing needs the
 * `clientRequestId`, and the scan that generated it is over by the time
 * anybody reaches for the button — keeping the two apart is how the id used
 * to get thrown away.
 */
export type DoorOutcome =
  | { readonly kind: 'sent'; readonly request: ScanRequest; readonly result: CheckInResult }
  | { readonly kind: 'queued'; readonly request: ScanRequest }
  | { readonly kind: 'failed'; readonly request: ScanRequest }

/**
 * The photograph, after the fact.
 *
 * Deliberately not part of `scan()`. The door cannot wait for an upload before
 * saying "endavant" — that is a wifi round trip with a queue behind you — so
 * the person is let in first and the picture follows. If it never follows, the
 * check-in is untouched, which is the right way round: the photograph is
 * useful and the check-in is the point.
 *
 * Nothing is queued for later. A blob cannot be sent by the twenty-second
 * flush without holding a megabyte per waiting scan in IndexedDB and pushing
 * it up in a basement, and the thing worth saving there is the check-in.
 */
export async function attachEntryPhoto(
  eventId: string,
  userId: string,
  photo: Blob,
): Promise<void> {
  const path = await uploadDoorPhoto(photo, 'entrada', eventId, userId)
  const { data, error } = await supabase.rpc('admin_set_entry_photo', {
    p_event_id: eventId,
    p_user_id: userId,
    p_path: path,
  })
  if (error) throw new DbError(error)

  // The bytes have to go up before there is a path to offer, so a row that
  // already had a photograph leaves this one with nothing pointing at it.
  // Taking it straight back out is the only moment anybody knows it is an
  // orphan; a week later it is indistinguishable from a real photograph.
  const verdict = (data as { estat?: string } | null)?.estat
  if (verdict !== 'desada') await supabase.storage.from(DOOR_PHOTOS).remove([path])
}

/**
 * Whether this verdict means somebody just walked in.
 *
 * `already_checked_in` is the one that has a name and a user id and must not
 * count: that scan changed nothing, so photographing it would be a second
 * picture of somebody who has been inside for an hour.
 */
export function admittedSomebody(result: CheckInResult): boolean {
  return UNDOABLE.has(result.status)
}

/** Which of the two a thrown scan was. Offline is the queue working. */
export function outcomeFromFailure(request: ScanRequest): DoorOutcome {
  return navigator.onLine ? { kind: 'failed', request } : { kind: 'queued', request }
}

/**
 * Taking a scan back, which is not one operation.
 *
 * Where the row is decides what has to happen, and getting it wrong is worse
 * than not offering the button: undoing a queued scan against the server would
 * hit a row that does not exist yet, and undoing a landed one by clearing the
 * queue would report success and change nothing.
 */
export type UndoTarget =
  /** It landed. There is a row, and the audited RPC is the only way to move it. */
  | { readonly kind: 'row'; readonly eventId: string; readonly userId: string }
  /** It never left. Removing the queue entry is the whole of it. */
  | { readonly kind: 'queued'; readonly clientRequestId: string }
  /**
   * It was sent and never answered, so it is in the queue AND may be on the
   * server: `scan()` leaves a failure queued on purpose, and the twenty-second
   * flush may have got through since. Both, in that order.
   */
  | {
      readonly kind: 'unsure'
      readonly clientRequestId: string
      readonly eventId: string
      readonly userId: string
    }

/** The three that admitted somebody, which are the three there is anything to take back. */
const UNDOABLE: ReadonlySet<CheckInStatus> = new Set<CheckInStatus>([
  'ok',
  'ok_walkin',
  'ok_walkin_review',
])

/**
 * What this outcome would undo, or null when the answer is nothing.
 *
 * `already_checked_in` is the one that looks undoable and must not be: that
 * scan changed nothing, so the button would quietly take back an earlier
 * check-in somebody else made while claiming to undo the tap just made.
 */
export function undoTargetOf(outcome: DoorOutcome): UndoTarget | null {
  const { request } = outcome

  if (outcome.kind === 'sent') {
    const { status, user_id } = outcome.result
    if (!UNDOABLE.has(status) || user_id === undefined) return null
    return { kind: 'row', eventId: request.eventId, userId: user_id }
  }

  // A QR that never reached the server never resolved to anybody either — the
  // token only becomes a person inside `check_in` — so the queue is all there
  // is to go on. A name tapped on the manual list is the case that can do more.
  if (outcome.kind === 'queued' || request.userId === null) {
    return { kind: 'queued', clientRequestId: request.clientRequestId }
  }

  return {
    kind: 'unsure',
    clientRequestId: request.clientRequestId,
    eventId: request.eventId,
    userId: request.userId,
  }
}

export async function undo(target: UndoTarget): Promise<void> {
  // Out of the queue first. The other order leaves a window where the flush
  // picks the entry up again after the server has been told to forget it.
  if (target.kind !== 'row') await dequeue(target.clientRequestId)
  if (target.kind === 'queued') return

  const { error } = await supabase.rpc('admin_undo_checkin', {
    p_event_id: target.eventId,
    p_user_id: target.userId,
  })
  if (error === null) return
  // P0002 is the RPC saying nobody was checked in, which for a scan we were
  // unsure about is the good answer: it never landed, and the queue entry we
  // just removed was the whole of it.
  if (target.kind === 'unsure' && error.code === 'P0002') return
  throw new DbError(error)
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
    if (error) throw new DbError(error)
  }
}

/**
 * How an outcome is drawn, wherever it is drawn.
 *
 * A queued scan borrows the "in, but look at this later" presentation. It is
 * not a success — nothing has been checked against the database yet — and not
 * a failure either, because the person is through the door. `ok_walkin_review`
 * already means exactly that, so it gets the same tick with a mark beside it
 * and the same double buzz.
 */
export function presentationOf(outcome: DoorOutcome): ScanPresentation {
  if (outcome.kind === 'sent') return SCAN_PRESENTATION[outcome.result.status]
  if (outcome.kind === 'queued') {
    return { ...SCAN_PRESENTATION.ok_walkin_review, messageKey: 'scanner.queued' }
  }
  return SCAN_PRESENTATION.error
}
