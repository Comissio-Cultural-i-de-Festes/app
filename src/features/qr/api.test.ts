import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  rpc: (...args: unknown[]) => rpc(...args) as unknown,
}))

const { fetchQrToken, forgetCachedTokens, readCachedToken } = await import('./api')

const ME = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const TOKEN = 'fd6b16d0-1030-4b84-a8d9-3db4b9fa6205'

beforeEach(() => {
  localStorage.clear()
  rpc.mockReset()
})

describe('the door pass', () => {
  it('keeps the token so the next time needs no signal', async () => {
    rpc.mockResolvedValue({ data: TOKEN, error: null })

    await fetchQrToken(ME)

    expect(readCachedToken(ME)).toBe(TOKEN)
  })

  it('hands back the kept one when the request fails', async () => {
    // The whole reason this screen exists offline. A basement, a farmhouse, a
    // hundred phones on one cell — the member's phone must not need a
    // connection, only the scanner does.
    rpc.mockResolvedValueOnce({ data: TOKEN, error: null })
    await fetchQrToken(ME)

    rpc.mockResolvedValue({ data: null, error: { message: 'network', code: '' } })

    await expect(fetchQrToken(ME)).resolves.toBe(TOKEN)
  })

  it('fails when there is nothing kept and nothing to be had', async () => {
    // Better than rendering a QR of nothing, which scans as a stranger.
    rpc.mockResolvedValue({ data: null, error: { message: 'network', code: '' } })

    await expect(fetchQrToken(ME)).rejects.toBeDefined()
  })

  it('keeps one token per person, because a phone gets passed around', async () => {
    rpc.mockResolvedValueOnce({ data: TOKEN, error: null })
    await fetchQrToken(ME)

    expect(readCachedToken(OTHER)).toBeNull()
  })

  it('forgets every token on the way out', async () => {
    // Signing out is the one moment a shared phone stops being yours, and a
    // door pass left behind is a door pass somebody else can use.
    rpc.mockResolvedValue({ data: TOKEN, error: null })
    await fetchQrToken(ME)
    await fetchQrToken(OTHER)

    forgetCachedTokens()

    expect(readCachedToken(ME)).toBeNull()
    expect(readCachedToken(OTHER)).toBeNull()
  })

  it('survives storage being unavailable', () => {
    // Private mode, or a browser set to block site data. The screen still has
    // to work with a connection.
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(readCachedToken(ME)).toBeNull()
    spy.mockRestore()
  })
})
