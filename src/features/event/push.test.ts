import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('@/config/env', () => ({ env: { vapidPublicKey: 'AQIDBA' } }))
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) as unknown },
}))

import { ensureSubscriptionSaved, sameKey } from './push'

// AQIDBA is 1,2,3,4; BQYHCA is 5,6,7,8.
const CURRENT = Uint8Array.of(1, 2, 3, 4).buffer
const OTHER = Uint8Array.of(5, 6, 7, 8).buffer

function fakeSubscription(endpoint: string, key: ArrayBuffer | null | 'no-options') {
  return {
    options: key === 'no-options' ? null : { applicationServerKey: key },
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({ endpoint, keys: { p256dh: `p-${endpoint}`, auth: `a-${endpoint}` } }),
  }
}

function install(existing: ReturnType<typeof fakeSubscription> | null) {
  const fresh = fakeSubscription('https://fcm.googleapis.com/new', CURRENT)
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(existing),
    subscribe: vi.fn().mockResolvedValue(fresh),
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  })
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', { permission: 'granted' })
  return { pushManager, fresh }
}

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sameKey', () => {
  it('compara byte a byte', () => {
    expect(sameKey(CURRENT, Uint8Array.of(1, 2, 3, 4).buffer)).toBe(true)
    expect(sameKey(CURRENT, OTHER)).toBe(false)
    expect(sameKey(CURRENT, Uint8Array.of(1, 2, 3).buffer)).toBe(false)
  })
})

describe('ensureSubscriptionSaved i la clau VAPID', () => {
  it('amb la mateixa clau només desa la subscripció que ja hi ha', async () => {
    const old = fakeSubscription('https://fcm.googleapis.com/old', CURRENT)
    const { pushManager } = install(old)

    expect(await ensureSubscriptionSaved()).toBe(true)

    expect(old.unsubscribe).not.toHaveBeenCalled()
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_endpoint: 'https://fcm.googleapis.com/old' })
  })

  it('amb una clau diferent es dessubscriu, es torna a subscriure i desa la nova', async () => {
    const old = fakeSubscription('https://fcm.googleapis.com/old', OTHER)
    const { pushManager } = install(old)

    expect(await ensureSubscriptionSaved()).toBe(true)

    expect(old.unsubscribe).toHaveBeenCalledTimes(1)
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1)
    const opts = pushManager.subscribe.mock.calls[0]?.[0] as {
      userVisibleOnly: boolean
      applicationServerKey: ArrayBuffer
    }
    expect(opts.userVisibleOnly).toBe(true)
    expect(sameKey(opts.applicationServerKey, CURRENT)).toBe(true)
    expect(old.unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(
      pushManager.subscribe.mock.invocationCallOrder[0] ?? 0,
    )
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_endpoint: 'https://fcm.googleapis.com/new' })
  })

  it('si la clau és nul·la no toca res: no es pot saber i no val la pena trencar-ne una que va', async () => {
    for (const key of [null, 'no-options'] as const) {
      rpc.mockClear()
      const old = fakeSubscription('https://fcm.googleapis.com/old', key)
      const { pushManager } = install(old)

      expect(await ensureSubscriptionSaved()).toBe(true)

      expect(old.unsubscribe).not.toHaveBeenCalled()
      expect(pushManager.subscribe).not.toHaveBeenCalled()
    }
  })

  it('si el servidor rebutja la nova, el navegador es queda amb la nova i no es reintenta', async () => {
    const old = fakeSubscription('https://fcm.googleapis.com/old', OTHER)
    const { pushManager } = install(old)
    rpc.mockResolvedValue({ error: { code: '500', message: 'boom' } })

    expect(await ensureSubscriptionSaved()).toBe(false)

    expect(pushManager.subscribe).toHaveBeenCalledTimes(1)
    expect(old.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('si subscriure falla després de dessubscriure, torna fals sense llançar', async () => {
    const old = fakeSubscription('https://fcm.googleapis.com/old', OTHER)
    const { pushManager } = install(old)
    pushManager.subscribe.mockRejectedValue(new Error('push service error'))

    expect(await ensureSubscriptionSaved()).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})
