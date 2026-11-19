import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

const env = vi.hoisted(() => ({ vapidPublicKey: 'AQIDBA' }))
vi.mock('@/config/env', () => ({ env }))
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
  env.vapidPublicKey = 'AQIDBA'
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
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

  it('amb una clau real de 65 bytes en base64url, amb - i _ i sense encoixinat', async () => {
    // 0xfb 0xff són «-_» en base64url i «+/» en base64; 65 bytes donen 87
    // caràcters, o sigui un encoixinat que base64url omet.
    const bytes = Uint8Array.from({ length: 65 }, (_, i) => (i % 2 === 0 ? 0xfb : 0xff))
    bytes[0] = 4
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    const url = btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
    expect(url).toMatch(/[-_]/)
    expect(url.length % 4).not.toBe(0)

    env.vapidPublicKey = url
    const old = fakeSubscription('https://fcm.googleapis.com/old', bytes.buffer)
    const { pushManager } = install(old)

    expect(await ensureSubscriptionSaved()).toBe(true)
    expect(old.unsubscribe).not.toHaveBeenCalled()
    expect(pushManager.subscribe).not.toHaveBeenCalled()
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

  it('si el servidor rebutja la nova, el navegador es queda amb la nova', async () => {
    const old = fakeSubscription('https://fcm.googleapis.com/old', OTHER)
    const { pushManager } = install(old)
    rpc.mockResolvedValue({ error: { code: '500', message: 'boom' } })

    expect(await ensureSubscriptionSaved()).toBe(false)

    expect(pushManager.subscribe).toHaveBeenCalledTimes(1)
    expect(old.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('si subscriure falla després de dessubscriure, torna fals sense llançar; la sessió següent subscriu', async () => {
    const old = fakeSubscription('https://fcm.googleapis.com/old', OTHER)
    const { pushManager } = install(old)
    pushManager.subscribe.mockRejectedValue(new Error('push service error'))

    expect(await ensureSubscriptionSaved()).toBe(false)
    expect(rpc).not.toHaveBeenCalled()

    pushManager.getSubscription.mockResolvedValue(null)
    pushManager.subscribe.mockResolvedValue(
      fakeSubscription('https://fcm.googleapis.com/new', CURRENT),
    )
    expect(await ensureSubscriptionSaved()).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('amb el permís concedit i cap subscripció, en crea una i la desa', async () => {
    const { pushManager } = install(null)

    expect(await ensureSubscriptionSaved()).toBe(true)

    expect(pushManager.subscribe).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_endpoint: 'https://fcm.googleapis.com/new' })
  })

  it('sense xarxa no toca res, ni dessubscriu', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const old = fakeSubscription('https://fcm.googleapis.com/old', OTHER)
    const { pushManager } = install(old)

    expect(await ensureSubscriptionSaved()).toBe(false)

    expect(old.unsubscribe).not.toHaveBeenCalled()
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('dues crides alhora comparteixen una sola execució', async () => {
    const old = fakeSubscription('https://fcm.googleapis.com/old', OTHER)
    const { pushManager } = install(old)

    const [a, b] = await Promise.all([ensureSubscriptionSaved(), ensureSubscriptionSaved()])

    expect([a, b]).toEqual([true, true])
    expect(old.unsubscribe).toHaveBeenCalledTimes(1)
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1)
  })

  it('amb una clau configurada malformada no dessubscriu res', async () => {
    env.vapidPublicKey = '***no-es-base64***'
    const old = fakeSubscription('https://fcm.googleapis.com/old', OTHER)
    install(old)

    expect(await ensureSubscriptionSaved()).toBe(false)
    expect(old.unsubscribe).not.toHaveBeenCalled()
  })
})
