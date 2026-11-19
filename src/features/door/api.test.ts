import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CheckInStatus } from '@/design/states'
import type * as Queue from '@/lib/queue'

/**
 * The queue behind the scanner.
 *
 * What is being pinned here is the ordering: a scan is written down BEFORE it
 * is sent and rubbed out after it lands. Written after a failure instead would
 * lose every request that hangs rather than fails — which in a basement with
 * two hundred phones is most of them.
 */

const rpc = vi.fn()
const store = new Map<string, unknown>()
/** The phone refusing to write anything down: private mode, a full disk, a blocked open. */
const disk = { refuses: false }

// `check_in` goes through a builder that takes a signal, and an aborted request
// resolves with an error rather than rejecting, which is what postgrest-js does
// with a cancelled fetch. Everything else awaits the call as it comes.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => {
      const answer = rpc(...args) as Promise<unknown>
      return {
        abortSignal: (signal: AbortSignal) =>
          new Promise((resolve) => {
            signal.addEventListener('abort', () => {
              resolve({ data: null, error: { message: 'AbortError: aborted', code: '' } })
            })
            void answer.then(resolve)
          }),
        then: (ok: (value: unknown) => unknown, ko: (error: unknown) => unknown) =>
          answer.then(ok, ko),
      }
    },
  },
}))

vi.mock('@/lib/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof Queue>()),
  enqueue: (scan: { clientRequestId: string }) => {
    if (disk.refuses) return Promise.resolve(false)
    store.set(scan.clientRequestId, scan)
    return Promise.resolve(true)
  },
  dequeue: (id: string) => {
    store.delete(id)
    return Promise.resolve(true)
  },
  setHeld: (id: string, held: unknown) => {
    const row = store.get(id) as Record<string, unknown> | undefined
    if (row !== undefined) store.set(id, { ...row, held: held ?? undefined })
    return Promise.resolve()
  },
  // Like the real one: an entry somebody removed is not written back.
  bumpTries: (scan: { clientRequestId: string; tries: number }) => {
    if (store.has(scan.clientRequestId)) {
      store.set(scan.clientRequestId, { ...scan, tries: scan.tries + 1 })
    }
    return Promise.resolve()
  },
  pending: () => Promise.resolve([...store.values()]),
}))

const { NotSaved } = await import('@/lib/queue')
const {
  DOOR_TIMEOUT_MS,
  DoorTimeout,
  awardPoints,
  flushQueue,
  outcomeFromFailure,
  presentationOf,
  resendHeld,
  scan,
  undo,
  undoTargetOf,
} = await import('./api')

const EVENT = '00000000-0000-4000-8000-0000000000e1'
const TOKEN = 'fd6b16d0-1030-4b84-a8d9-3db4b9fa6205'

function request(id: string) {
  return { clientRequestId: id, eventId: EVENT, qrToken: TOKEN, userId: null }
}

beforeEach(() => {
  store.clear()
  disk.refuses = false
  rpc.mockReset()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('a scan at the door', () => {
  it('leaves nothing behind when it gets through', async () => {
    rpc.mockResolvedValue({ data: { status: 'ok', nombre: 'Alfa' }, error: null })

    await expect(scan(request('a'))).resolves.toMatchObject({ status: 'ok' })
    expect(store.size).toBe(0)
  })

  it('keeps the scan when the network does not answer', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network', code: '' } })

    await expect(scan(request('b'))).rejects.toBeDefined()
    expect(store.has('b')).toBe(true)
  })

  it('resends what is waiting, oldest first, and clears it', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network', code: '' } })
    await expect(scan(request('one'))).rejects.toBeDefined()
    await expect(scan(request('two'))).rejects.toBeDefined()

    rpc.mockReset()
    rpc.mockResolvedValue({ data: { status: 'ok' }, error: null })

    await expect(flushQueue()).resolves.toEqual({ sent: 2, left: 0 })
    expect(store.size).toBe(0)

    const sentIds = rpc.mock.calls.map(
      (call) => (call[1] as { p_client_request_id: string }).p_client_request_id,
    )
    expect(sentIds).toEqual(['one', 'two'])
  })

  it('sends the same request id it wrote down, which is what stops double points', async () => {
    // check_in is idempotent on this id. Generating a new one on the resend
    // would turn one arrival into two, and the member would see the points
    // twice with nothing in the app to explain it.
    rpc.mockResolvedValue({ data: null, error: { message: 'network', code: '' } })
    await expect(scan(request('stable'))).rejects.toBeDefined()

    rpc.mockReset()
    rpc.mockResolvedValue({ data: { status: 'ok' }, error: null })
    await flushQueue()

    expect(rpc).toHaveBeenCalledWith(
      'check_in',
      expect.objectContaining({ p_client_request_id: 'stable', p_qr_token: TOKEN }),
    )
  })

  it('stops at the first refusal instead of hammering a dead connection', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network', code: '' } })
    await expect(scan(request('one'))).rejects.toBeDefined()
    await expect(scan(request('two'))).rejects.toBeDefined()

    rpc.mockReset()
    rpc
      .mockResolvedValueOnce({ data: { status: 'ok' }, error: null })
      .mockResolvedValue({ data: null, error: { message: 'network', code: '' } })

    await expect(flushQueue()).resolves.toEqual({ sent: 1, left: 1 })
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('runs one flush at a time, and a second caller shares the first run', async () => {
    // The timer, the `online` event and both screens all call it. Two runs
    // over the same snapshot sent every entry twice.
    store.set('one', { ...request('one'), at: 1, tries: 0 })
    store.set('two', { ...request('two'), at: 2, tries: 0 })
    rpc.mockResolvedValue({ data: { status: 'ok' }, error: null })

    const first = flushQueue()
    const second = flushQueue()

    expect(second).toBe(first)
    await expect(first).resolves.toEqual({ sent: 2, left: 0 })
    expect(rpc).toHaveBeenCalledTimes(2)

    // And it is free again once it is done.
    store.set('three', { ...request('three'), at: 3, tries: 0 })
    await expect(flushQueue()).resolves.toEqual({ sent: 1, left: 0 })
  })
})

describe('a scan the phone could not write down', () => {
  it('is sent all the same, and a landed answer is an answer like any other', async () => {
    disk.refuses = true
    rpc.mockResolvedValue({ data: { status: 'ok', nombre: 'Alfa' }, error: null })

    await expect(scan(request('d1'))).resolves.toMatchObject({ status: 'ok' })
    expect(rpc).toHaveBeenCalledWith(
      'check_in',
      expect.objectContaining({ p_client_request_id: 'd1' }),
    )
  })

  it('says it was not saved when it did not get through either, never "queued"', async () => {
    disk.refuses = true
    rpc.mockResolvedValue({ data: null, error: { message: 'network', code: '' } })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const req = request('d2')

    const cause = await scan(req).catch((error: unknown) => error)
    expect(cause).toBeInstanceOf(NotSaved)

    const outcome = outcomeFromFailure(req, cause)
    expect(outcome.kind).toBe('unsaved')
    expect(presentationOf(outcome).messageKey).toBe('scanner.notSaved')
    expect(presentationOf(outcome).actionKey).toBe('scanner.action.notSaved')
    // There is nothing to take back: no row anywhere.
    expect(undoTargetOf(outcome)).toBeNull()
  })

  it('is not saved after a timeout either, even though one that was saved is "queued"', async () => {
    vi.useFakeTimers()
    disk.refuses = true
    rpc.mockReturnValue(new Promise<never>(() => undefined))
    const req = request('d3')

    const caught = scan(req).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(DOOR_TIMEOUT_MS)

    expect(outcomeFromFailure(req, await caught).kind).toBe('unsaved')
  })
})

describe('a scan the server refuses for good', () => {
  const refusal = {
    data: null,
    error: { message: 'invalid input syntax for type uuid', code: '22P02' },
  }

  it('is not left in the queue, and the card does not say it goes on its own', async () => {
    rpc.mockResolvedValue(refusal)
    const req = request('r1')

    const cause = await scan(req).catch((error: unknown) => error)
    expect(store.has('r1')).toBe(false)

    const outcome = outcomeFromFailure(req, cause)
    expect(outcome).toMatchObject({ kind: 'failed', refused: true })
    expect(presentationOf(outcome).actionKey).toBe('scanner.action.refused')
    expect(undoTargetOf(outcome)).toBeNull()
  })

  it('does not hold up the queue behind it when it is first in line', async () => {
    store.set('bad', { ...request('bad'), at: 1, tries: 0 })
    store.set('good', { ...request('good'), at: 2, tries: 0 })
    rpc.mockImplementation((_name: string, args: { p_client_request_id: string }) =>
      Promise.resolve(
        args.p_client_request_id === 'bad' ? refusal : { data: { status: 'ok' }, error: null },
      ),
    )

    await expect(flushQueue()).resolves.toEqual({ sent: 1, left: 0 })
    expect(store.has('good')).toBe(false)
    expect(store.get('bad')).toMatchObject({ held: { kind: 'refused', code: '22P02' } })

    // Set aside, so the next run does not ask again.
    rpc.mockClear()
    await expect(flushQueue()).resolves.toEqual({ sent: 0, left: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('is sent again, after the flush already running, when somebody asks', async () => {
    store.set('bad', {
      ...request('bad'),
      at: 1,
      tries: 0,
      held: { kind: 'refused', code: '22P02' },
    })
    store.set('slow', { ...request('slow'), at: 2, tries: 0 })
    let finish!: (value: unknown) => void
    rpc.mockImplementation((_name: string, args: { p_client_request_id: string }) =>
      args.p_client_request_id === 'slow'
        ? new Promise((resolve) => {
            finish = resolve
          })
        : Promise.resolve({ data: { status: 'ok' }, error: null }),
    )

    const running = flushQueue()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const retried = resendHeld()
    finish({ data: { status: 'ok' }, error: null })
    await running

    // The run in progress read its list before the mark came off; the retry
    // waits for it and then runs its own, which is the one that sends `bad`.
    await expect(retried).resolves.toEqual({ sent: 1, left: 0 })
    expect(store.size).toBe(0)
  })
})

describe('a refusal that is about whoever sent it, not the scan', () => {
  // `check_in` raises 42501 from `is_admin()`: a session that lapsed and went
  // out as `anon`, or a junta role taken away. Never about the scan.
  const notJunta = { data: null, error: { message: 'nomes junta', code: '42501' } }

  it('leaves the flush to try again, instead of setting good scans aside', async () => {
    store.set('one', { ...request('one'), at: 1, tries: 0 })
    store.set('two', { ...request('two'), at: 2, tries: 0 })
    rpc.mockResolvedValue(notJunta)

    await expect(flushQueue()).resolves.toEqual({ sent: 0, left: 2 })
    expect(store.get('one')).toMatchObject({ tries: 1 })
    expect(store.get('one')).not.toHaveProperty('held')
    expect(rpc).toHaveBeenCalledTimes(1)

    // The session comes back, and both go.
    rpc.mockReset()
    rpc.mockResolvedValue({ data: { status: 'ok' }, error: null })
    await expect(flushQueue()).resolves.toEqual({ sent: 2, left: 0 })
    expect(store.size).toBe(0)
  })

  it('keeps a live scan in the queue rather than dropping it', async () => {
    rpc.mockResolvedValue(notJunta)
    const req = request('n1')

    const cause = await scan(req).catch((error: unknown) => error)

    expect(store.get('n1')).toMatchObject({ tries: 1 })
    expect(outcomeFromFailure(req, cause)).not.toHaveProperty('refused')
  })
})

describe('an answer from a flush that asks somebody to act', () => {
  it('goes out again when it was about the event, not the scan', async () => {
    // Unpublished for ten minutes by mistake: everything flushed meanwhile
    // came back `event_not_open`, and the junta must be able to send it again.
    store.set('closed', { ...request('closed'), at: 1, tries: 0 })
    store.set('stranger', { ...request('stranger'), at: 2, tries: 0 })
    rpc.mockImplementation((_name: string, args: { p_client_request_id: string }) =>
      Promise.resolve({
        data: { status: args.p_client_request_id === 'closed' ? 'event_not_open' : 'not_a_member' },
        error: null,
      }),
    )
    await flushQueue()
    expect(store.get('closed')).toMatchObject({ held: { status: 'event_not_open' } })

    rpc.mockReset()
    rpc.mockResolvedValue({ data: { status: 'ok' }, error: null })
    await expect(resendHeld()).resolves.toEqual({ sent: 1, left: 0 })

    // Only that one: a stranger's answer would only replay.
    expect([...store.keys()]).toEqual(['stranger'])
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('is kept with its status and name, and not sent again', async () => {
    store.set('stranger', { ...request('stranger'), at: 1, tries: 0 })
    store.set('dup', { ...request('dup'), at: 2, tries: 0 })
    store.set('fine', { ...request('fine'), at: 3, tries: 0 })
    const answers: Record<string, unknown> = {
      stranger: { status: 'member_inactive', nombre: 'Persona Inventada' },
      dup: { status: 'already_checked_in', nombre: 'Alfa' },
      fine: { status: 'ok', nombre: 'Beta' },
    }
    rpc.mockImplementation((_name: string, args: { p_client_request_id: string }) =>
      Promise.resolve({ data: answers[args.p_client_request_id], error: null }),
    )

    await expect(flushQueue()).resolves.toEqual({ sent: 3, left: 0 })
    expect([...store.keys()]).toEqual(['stranger'])
    expect(store.get('stranger')).toMatchObject({
      held: { kind: 'answered', status: 'member_inactive', nombre: 'Persona Inventada' },
    })

    rpc.mockClear()
    await flushQueue()
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('a check-in that never answers', () => {
  // The request leaves and nothing comes back, neither an answer nor a
  // failure. Without a limit the card never appears and the person in front
  // of the phone is left standing there.
  const hanging = () => new Promise<never>(() => undefined)

  it('stops waiting at the limit and leaves the scan in the queue', async () => {
    vi.useFakeTimers()
    rpc.mockReturnValue(hanging())

    const settled = expect(scan(request('h1'))).rejects.toBeInstanceOf(DoorTimeout)
    await vi.advanceTimersByTimeAsync(DOOR_TIMEOUT_MS)
    await settled

    expect(store.get('h1')).toMatchObject({ clientRequestId: 'h1', tries: 1 })
  })

  it('does not give up on an answer that is only slow', async () => {
    vi.useFakeTimers()
    rpc.mockReturnValue(
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({ data: { status: 'ok' }, error: null })
        }, DOOR_TIMEOUT_MS - 1_000)
      }),
    )

    const settled = expect(scan(request('slow'))).resolves.toMatchObject({ status: 'ok' })
    await vi.advanceTimersByTimeAsync(DOOR_TIMEOUT_MS)
    await settled

    expect(store.size).toBe(0)
    // Cleared with the answer, so nothing is aborted after the fact.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('is drawn as queued even though the browser says there is signal', async () => {
    // A saturated network is still a network: `navigator.onLine` stays true,
    // so it cannot be what decides this one.
    vi.useFakeTimers()
    rpc.mockReturnValue(hanging())
    const req = request('h2')

    const caught = scan(req).catch((cause: unknown) => cause)
    await vi.advanceTimersByTimeAsync(DOOR_TIMEOUT_MS)
    const outcome = outcomeFromFailure(req, await caught)

    expect(navigator.onLine).toBe(true)
    expect(outcome.kind).toBe('queued')
    expect(presentationOf(outcome).messageKey).toBe('scanner.queued')
  })

  it('goes out once more, with the same id, when the flush comes round', async () => {
    vi.useFakeTimers()
    rpc.mockReturnValue(hanging())
    const caught = scan(request('h3')).catch(() => undefined)
    await vi.advanceTimersByTimeAsync(DOOR_TIMEOUT_MS)
    await caught

    vi.useRealTimers()
    rpc.mockReset()
    rpc.mockResolvedValue({ data: { status: 'ok', replayed: true }, error: null })

    await expect(flushQueue()).resolves.toEqual({ sent: 1, left: 0 })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith(
      'check_in',
      expect.objectContaining({ p_client_request_id: 'h3' }),
    )
    expect(store.size).toBe(0)
  })

  it('is undone on both sides when it was a name, because it may have landed', () => {
    // Unlike a scan that never left, this one did. Dropping only the queue
    // entry would say the person is gone while their row stays on the server.
    const USER = '00000000-0000-4000-8000-0000000000a2'
    const req = { clientRequestId: 'h4', eventId: EVENT, qrToken: null, userId: USER }

    expect(undoTargetOf(outcomeFromFailure(req, new DoorTimeout()))).toEqual({
      kind: 'unsure',
      clientRequestId: 'h4',
      eventId: EVENT,
      userId: USER,
    })
  })

  it('still undoes a scan that never left by dropping it alone', () => {
    const req = { clientRequestId: 'h5', eventId: EVENT, qrToken: null, userId: 'u' }
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    expect(undoTargetOf(outcomeFromFailure(req, new Error('offline')))).toEqual({
      kind: 'queued',
      clientRequestId: 'h5',
    })
  })

  it('offers no undo for a QR that left and never answered', () => {
    // Seen at the door in testing: the row had landed, the answer had not,
    // and "Desfés" would have dropped the queue entry and said the check-in
    // never went, with the person still checked in. A QR only becomes a name
    // inside `check_in`, so there is nobody to take back from here.
    expect(undoTargetOf(outcomeFromFailure(request('h6'), new DoorTimeout()))).toBeNull()
  })
})

describe('awarding points to several people', () => {
  it('keeps the ones that went through when one fails', async () => {
    // Four people carried the speakers. If the third call fails, the first two
    // keep their points: award_points is the audited unit, and re-running the
    // whole batch would double what already landed.
    rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom', code: '' } })

    await expect(awardPoints(['a', 'b', 'c', 'd'], EVENT, 'montaje', 20)).rejects.toBeDefined()
    expect(rpc).toHaveBeenCalledTimes(3)
  })
})

describe('taking a scan back', () => {
  const USER = '00000000-0000-4000-8000-0000000000a1'

  function sent(status: CheckInStatus, id = 'r1') {
    return {
      kind: 'sent',
      request: { clientRequestId: id, eventId: EVENT, qrToken: TOKEN, userId: null },
      result: { status, user_id: USER, nombre: 'Alfa' },
    } as const
  }

  it('undoes a landed scan against the server and leaves the queue alone', async () => {
    const target = undoTargetOf(sent('ok'))
    expect(target).toEqual({ kind: 'row', eventId: EVENT, userId: USER })

    rpc.mockResolvedValue({ data: null, error: null })
    await undo(target!)

    expect(rpc).toHaveBeenCalledWith('admin_undo_checkin', {
      p_event_id: EVENT,
      p_user_id: USER,
    })
  })

  it('refuses to undo a scan that changed nothing', () => {
    // The dangerous one. `already_checked_in` means somebody else's earlier
    // check-in is the only thing there is to take back, and the button would
    // be claiming to undo the tap that just happened.
    expect(undoTargetOf(sent('already_checked_in'))).toBeNull()
    expect(undoTargetOf(sent('not_a_member'))).toBeNull()
    expect(undoTargetOf(sent('member_inactive'))).toBeNull()
    expect(undoTargetOf(sent('event_not_open'))).toBeNull()
  })

  it('undoes a queued scan by dropping it, without asking the server', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'offline', code: '' } })
    await expect(scan(request('q1'))).rejects.toBeDefined()
    expect(store.has('q1')).toBe(true)

    const outcome = {
      kind: 'queued',
      request: { clientRequestId: 'q1', eventId: EVENT, qrToken: TOKEN, userId: null },
    } as const
    rpc.mockReset()

    await undo(undoTargetOf(outcome)!)

    expect(store.has('q1')).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does both when a manual entry was sent and never answered', async () => {
    // `scan` leaves a failure queued on purpose and the flush retries every
    // twenty seconds, so by the time anybody reaches for undo the row may
    // exist after all. Only a name tapped on the list can check: a QR never
    // resolves to a person outside `check_in`.
    const outcome = {
      kind: 'failed',
      request: { clientRequestId: 'f1', eventId: EVENT, qrToken: null, userId: USER },
    } as const
    const target = undoTargetOf(outcome)
    expect(target).toMatchObject({ kind: 'unsure', clientRequestId: 'f1', userId: USER })

    store.set('f1', outcome.request)
    rpc.mockResolvedValue({ data: null, error: null })
    await undo(target!)

    expect(store.has('f1')).toBe(false)
    expect(rpc).toHaveBeenCalledWith('admin_undo_checkin', {
      p_event_id: EVENT,
      p_user_id: USER,
    })
  })

  it('treats "nobody was checked in" as success for a scan it was unsure about', async () => {
    // P0002 is the RPC saying it never landed, which is the good answer here:
    // the queue entry that was just removed was the whole of it.
    const target = {
      kind: 'unsure',
      clientRequestId: 'f2',
      eventId: EVENT,
      userId: USER,
    } as const
    rpc.mockResolvedValue({ data: null, error: { message: 'no fitxat', code: 'P0002' } })

    await expect(undo(target)).resolves.toBeUndefined()
  })

  it('still reports a refusal, so nobody is told a check-in is gone when it is not', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'nomes junta', code: '42501' } })

    await expect(undo({ kind: 'row', eventId: EVENT, userId: USER })).rejects.toBeDefined()
  })
})
