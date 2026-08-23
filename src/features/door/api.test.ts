import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const { awardPoints, flushQueue, scan } = await import('./api')

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
