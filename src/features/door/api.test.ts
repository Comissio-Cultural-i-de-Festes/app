import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CheckInStatus } from '@/design/states'

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

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) as unknown },
}))

vi.mock('@/lib/queue', () => ({
  enqueue: (scan: { clientRequestId: string }) => {
    store.set(scan.clientRequestId, scan)
    return Promise.resolve()
  },
  dequeue: (id: string) => {
    store.delete(id)
    return Promise.resolve()
  },
  bumpTries: (scan: { clientRequestId: string; tries: number }) => {
    store.set(scan.clientRequestId, { ...scan, tries: scan.tries + 1 })
    return Promise.resolve()
  },
  pending: () => Promise.resolve([...store.values()]),
}))

const { awardPoints, flushQueue, scan, undo, undoTargetOf } = await import('./api')

const EVENT = '00000000-0000-4000-8000-0000000000e1'
const TOKEN = 'fd6b16d0-1030-4b84-a8d9-3db4b9fa6205'

function request(id: string) {
  return { clientRequestId: id, eventId: EVENT, qrToken: TOKEN, userId: null }
}

beforeEach(() => {
  store.clear()
  rpc.mockReset()
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
