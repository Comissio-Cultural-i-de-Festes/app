import { type CheckInStatus, SCAN_PRESENTATION, type ScanPresentation } from '@/design/states'
import { DbError, unwrapAs } from '@/lib/db'
import type { Escola } from '@/lib/model'
import {
  type Held,
  type QueuedScan,
  NotSaved,
  bumpTries,
  dequeue,
  enqueue,
  pending,
  setHeld,
} from '@/lib/queue'
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

/**
 * How long the door waits for the server before it stops waiting.
 *
 * Eight seconds. On a working connection `check_in` answers in well under
 * one; on one bar shared with a room, a lost packet costs a second, the next
 * one two, the next four, so eight lets a connection that drops two in a row
 * still answer. Much longer and the person in front of the phone gives up and
 * holds the QR out again. Much shorter and a slow answer becomes "queued",
 * which costs the verdict: a QR that has not reached the server has no name
 * and no status, only "saved".
 *
 * Giving up does not lose the scan: it is already in the queue, and the flush
 * resends it with the same id, which `check_in` grants once. What giving up
 * cannot do is recall a request that is already on its way. An abandoned
 * check-in can still land after somebody has pressed "Desfés", and then the
 * person is back in with nothing on screen to say so. Closing that needs
 * `check_in` to recognise an id that was undone, which is a migration, not
 * something this file can promise.
 */
export const DOOR_TIMEOUT_MS = 8_000

/** It left, or was about to, and nothing came back in time. Whether it landed is unknown. */
export class DoorTimeout extends Error {
  constructor() {
    super('the door did not get an answer in time')
    this.name = 'DoorTimeout'
  }
}

/**
 * A call that cannot take longer than `DOOR_TIMEOUT_MS`, whatever it is doing.
 *
 * THE ABORT ALONE DID NOT ENFORCE IT. supabase-js asks for the access token
 * before it fetches, and a token with under ninety seconds left waits for a
 * refresh from `/token` with no limit of its own. During that wait there is no
 * request for the signal to cancel: the abort fires, nothing listens, and the
 * call hangs for as long as the refresh does — every hour, and every time an
 * iPhone comes back to the app with an expired token. So the deadline is a
 * race the caller always loses on time, and the abort is kept for the case
 * where the fetch did start, so it does not go on using the one bar there is.
 */
async function withDeadline<T>(call: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // Rejected before the abort, so the deadline is what settles the race: an
      // aborted call can come back resolved, with an error that looks like any
      // other network failure.
      reject(new DoorTimeout())
      controller.abort()
    }, DOOR_TIMEOUT_MS)
  })

  try {
    return await Promise.race([call(controller.signal), deadline])
  } finally {
    clearTimeout(timer)
  }
}

export async function checkIn(request: ScanRequest): Promise<CheckInResult> {
  const { data, error } = await withDeadline((signal) =>
    supabase
      .rpc('check_in', {
        p_event_id: request.eventId,
        p_client_request_id: request.clientRequestId,
        ...(request.qrToken === null ? {} : { p_qr_token: request.qrToken }),
        ...(request.userId === null ? {} : { p_user_id: request.userId }),
      })
      .abortSignal(signal),
  )
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
 * Whether `check_in` refused the scan itself, rather than whoever sent it.
 *
 * NOT `isPermanent`, WHICH COUNTS 42501, and at `check_in` that code is never
 * about the scan: it is `private.is_admin()` saying no, which is what a phone
 * hears when its session lapsed on a bad connection and the request went out
 * as `anon`, or when somebody's junta role was taken away. Treating it as the
 * scan's fault set aside every valid scan in the queue during a flush with the
 * token refresh lost, and nothing sent them again once the session came back.
 * It is a failure like a dropped connection: the entry stays, and the next
 * flush tries it.
 *
 * What is left is about the request: class 22 — a QR that is not a uuid
 * (22P02), a QR and a name together (22023) — and class 23, a constraint the
 * row cannot satisfy. Sending any of those again gets the same answer.
 */
export function refusesTheScan(cause: unknown): cause is DbError {
  return cause instanceof DbError && /^(?:22|23)/.test(cause.code)
}

/**
 * A scan, whether or not there is any signal.
 *
 * The queue is written first and cleared on success, rather than being a
 * fallback after a failure: a request that times out after thirty seconds
 * would otherwise be lost between the two.
 *
 * A queue that could not be written does not stop the scan. It is sent all
 * the same — `check_in` is idempotent on the id whether or not a copy exists
 * on the phone — and if it lands, the answer is as good as any other. Only if
 * it does not land is the difference worth saying, and then it is `NotSaved`:
 * nothing is going to send it later, so "queued" would be a lie told to
 * somebody who will wave the person through on the strength of it.
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
  const saved = await enqueue(queued)

  try {
    const result = await checkIn(request)
    if (saved) await dequeue(request.clientRequestId)
    return result
  } catch (cause) {
    // The server has said no and will say it again. The card says so now, and
    // a copy left behind would only be sent to hear it a second time — and,
    // first in line, would hold up every scan behind it.
    if (refusesTheScan(cause)) {
      if (saved) await dequeue(request.clientRequestId)
      throw cause
    }
    if (!saved) throw new NotSaved(cause)
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
  | {
      readonly kind: 'queued'
      readonly request: ScanRequest
      /**
       * It was sent and never answered, rather than never sent. Drawn the same,
       * because for the person at the door it is the same; undone differently,
       * because the row may exist.
       */
      readonly unanswered?: true
    }
  | {
      readonly kind: 'failed'
      readonly request: ScanRequest
      /**
       * The server answered, and the answer was no for good. Nothing was left
       * in the queue, so the card must not say it goes on its own.
       */
      readonly refused?: true
    }
  /**
   * Neither on the server nor on the phone. Not `queued`, however much it
   * looks like it from the door: nothing will ever send it, so somebody has to
   * do it by hand.
   */
  | { readonly kind: 'unsaved'; readonly request: ScanRequest }

/**
 * Which of the two a thrown scan was. Offline is the queue working.
 *
 * A timeout is the queue working too, and `navigator.onLine` cannot see it: a
 * saturated network is still a network. Calling it "failed" would tell the
 * junta to try again, and trying again is a second request for something the
 * flush is already going to send.
 */
export function outcomeFromFailure(request: ScanRequest, cause: unknown): DoorOutcome {
  if (cause instanceof NotSaved) return { kind: 'unsaved', request }
  if (refusesTheScan(cause)) return { kind: 'failed', request, refused: true }
  if (cause instanceof DoorTimeout) return { kind: 'queued', request, unanswered: true }
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
   * flush may have got through since. Both, in that order. A timeout is this
   * case too, even though its card says "queued".
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

  // Nothing was written down, and as far as anybody knows nothing landed.
  if (outcome.kind === 'unsaved') return null
  if (outcome.kind === 'failed' && outcome.refused === true) return null

  if (outcome.kind === 'sent') {
    const { status, user_id } = outcome.result
    if (!UNDOABLE.has(status) || user_id === undefined) return null
    return { kind: 'row', eventId: request.eventId, userId: user_id }
  }

  // A QR that never reached the server never resolved to anybody either — the
  // token only becomes a person inside `check_in` — so the queue is all there
  // is to go on. A name tapped on the manual list is the case that can do more.
  //
  // Except a QR that timed out. That one did reach the server, often enough to
  // have landed — it was seen doing exactly that while this was tested — and
  // dropping its queue entry would say "it never went" about somebody who is
  // checked in. No button is the honest answer there: the person is taken back
  // from the check-ins list once the row shows up.
  if (outcome.kind === 'queued' && outcome.unanswered === true && request.userId === null) {
    return null
  }
  const neverLeft = outcome.kind === 'queued' && outcome.unanswered !== true
  if (neverLeft || request.userId === null) {
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

  // Under the same deadline as the check-in: a token refresh that never comes
  // back would otherwise leave the button on "desfent" for good.
  const { error } = await withDeadline((signal) =>
    supabase
      .rpc('admin_undo_checkin', {
        p_event_id: target.eventId,
        p_user_id: target.userId,
      })
      .abortSignal(signal),
  )
  if (error === null) return
  // P0002 is the RPC saying nobody was checked in. For a scan we were unsure
  // about that is the answer we hoped for, and the queue entry we just removed
  // was all there was — AS FAR AS ANYBODY CAN SEE NOW. A request abandoned on
  // a timeout may still be travelling, and if it lands after this the person
  // is checked in again. See `DOOR_TIMEOUT_MS`: closing that is a migration.
  if (target.kind === 'unsure' && error.code === 'P0002') return
  throw new DbError(error)
}

export interface FlushOutcome {
  readonly sent: number
  readonly left: number
}

/**
 * The answers a flush must not swallow.
 *
 * At the door these are on the card for somebody to act on. From a flush
 * there is no card: the scan was "saved" an hour ago and the person is long
 * inside. Rubbing the entry out would leave a stranger, or somebody nobody
 * charged, with no trace on any screen.
 *
 * Not `already_checked_in`. A QR held in front of the lens with no signal is
 * read every two seconds and queued each time; the first lands and the rest
 * all come back "already in". Keeping those would bury the ones above in noise
 * about one person who is, in fact, in.
 */
const NEEDS_A_LOOK: ReadonlySet<CheckInStatus> = new Set<CheckInStatus>([
  'not_a_member',
  'member_inactive',
  'event_not_open',
  'ok_walkin_review',
])

/**
 * Sends whatever is waiting. Stops at the first failure rather than hammering.
 *
 * EXCEPT A FAILURE THAT WILL NEVER STOP FAILING. A scan `check_in` raises an
 * error about — a token that is not a uuid, read off somebody else's QR with
 * no signal — used to sit at the front and end every run at the same place,
 * so nothing behind it was ever sent again. It is set aside instead, marked
 * with the code it got, and the run carries on. A scan that is not ours but
 * well formed does not raise anything: `check_in` answers `not_a_member`,
 * and that is the other thing set aside, with every answer in `NEEDS_A_LOOK`.
 * Kept rather than dropped, both of them: somebody walked through the door
 * and the junta has to see who (`HeldScans`).
 *
 * ONE AT A TIME. It is called by a twenty-second timer, by the `online` event
 * and by both door screens, and with an eight-second deadline per item two
 * runs overlap easily. Two runs read the same snapshot and send the same
 * entries twice. `check_in` makes that harmless for points, but the second
 * copy is a request that can still be on its way after an undo. A caller who
 * arrives during a run gets that run's answer.
 */
export function flushQueue(): Promise<FlushOutcome> {
  flushing ??= drain().finally(() => {
    flushing = null
  })
  return flushing
}

let flushing: Promise<FlushOutcome> | null = null

async function drain(): Promise<FlushOutcome> {
  const waiting = (await pending()).filter((item) => item.held === undefined)
  let sent = 0
  let refused = 0

  for (const item of waiting) {
    try {
      const result = await checkIn(item)
      if (NEEDS_A_LOOK.has(result.status)) {
        await setHeld(item.clientRequestId, {
          kind: 'answered',
          status: result.status,
          nombre: result.nombre ?? null,
        })
      } else {
        await dequeue(item.clientRequestId)
      }
      sent += 1
    } catch (cause) {
      if (refusesTheScan(cause)) {
        await setHeld(item.clientRequestId, { kind: 'refused', code: cause.code })
        refused += 1
        continue
      }
      await bumpTries(item)
      break
    }
  }

  return { sent, left: waiting.length - sent - refused }
}

/**
 * Whether sending a held scan again could get a different answer.
 *
 * `event_not_open` can: it is about the event, not the scan. Unpublished for
 * ten minutes by mistake, every scan flushed in those ten minutes came back
 * with it, and without a way to send them again they stayed aside for good.
 * `check_in` answers it before writing anything, so the same id goes through
 * once the event is open.
 *
 * The other answers cannot: they landed, and the same id replays the same
 * answer. The refused ones are errors about the request, which should come
 * back the same too; they are let through for the case nobody has thought of
 * yet, at the cost of one request each.
 */
export function resendable(held: Held): boolean {
  return held.kind === 'refused' || held.status === 'event_not_open'
}

/**
 * The held scans that could get another answer (`resendable`), sent once more.
 *
 * AFTER THE FLUSH THAT IS RUNNING, NOT INSIDE IT. A run already under way
 * read its list before the marks came off, and `flushQueue` hands a caller the
 * run in progress, so the button would have done nothing visible.
 */
export async function resendHeld(): Promise<FlushOutcome> {
  for (const item of await pending()) {
    if (item.held !== undefined && resendable(item.held)) {
      await setHeld(item.clientRequestId, null)
    }
  }
  if (flushing !== null) await flushing
  return flushQueue()
}

/** Forgets one. The junta has seen the line and dealt with it by hand. */
export async function discardHeld(clientRequestId: string): Promise<void> {
  await dequeue(clientRequestId)
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
 *
 * IT BORROWS THE SIGNAL, NOT THE WORDS. What was borrowed whole also carried
 * `actionKey`, which for `ok_walkin_review` reads "make sure they pay before
 * they come in" — said about somebody the server has never answered for, at a
 * door where the activity may well be free. `messageKey` was already being
 * replaced for the same reason and the line under it was missed.
 *
 * It goes to null rather than to a queued sentence of its own: the action line
 * is what the person holding the phone should do now, and with the scan safe
 * in the queue there is nothing. Inventing one would have repeated the
 * headline, which already says it is saved and will go when the signal does.
 */
export function presentationOf(outcome: DoorOutcome): ScanPresentation {
  if (outcome.kind === 'sent') return SCAN_PRESENTATION[outcome.result.status]
  // The error's colour and buzz, and words of its own: "could not connect, it
  // goes on its own" is what a failed scan says, and this one will not.
  if (outcome.kind === 'unsaved') {
    return {
      ...SCAN_PRESENTATION.error,
      messageKey: 'scanner.notSaved',
      actionKey: 'scanner.action.notSaved',
    }
  }
  if (outcome.kind === 'failed' && outcome.refused === true) {
    return {
      ...SCAN_PRESENTATION.error,
      messageKey: 'scanner.refused',
      actionKey: 'scanner.action.refused',
    }
  }
  if (outcome.kind === 'queued') {
    return { ...SCAN_PRESENTATION.ok_walkin_review, messageKey: 'scanner.queued', actionKey: null }
  }
  return SCAN_PRESENTATION.error
}
