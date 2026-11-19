import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ensure = vi.fn()
let granted = true
let userId = 'u1'

vi.mock('./push', () => ({
  ensureSubscriptionSaved: () => ensure() as Promise<boolean>,
  pushGranted: () => granted,
}))
vi.mock('@/features/session/useUserId', () => ({ useUserId: () => userId }))

import { resetKeepPushFresh, useKeepPushFresh } from './useKeepPushFresh'

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  ensure.mockReset()
  ensure.mockResolvedValue(true)
  granted = true
  userId = 'u1'
  resetKeepPushFresh()
})
afterEach(() => vi.restoreAllMocks())

describe('useKeepPushFresh', () => {
  it('comprova un cop per usuari i no torna a fer-ho si ha anat bé', async () => {
    const { rerender } = renderHook(() => useKeepPushFresh())
    await flush()
    rerender()
    window.dispatchEvent(new Event('online'))
    await flush()
    expect(ensure).toHaveBeenCalledTimes(1)
  })

  it('no fa res sense el permís concedit', async () => {
    granted = false
    renderHook(() => useKeepPushFresh())
    await flush()
    expect(ensure).not.toHaveBeenCalled()
  })

  it('si falla, reintenta quan torna la xarxa', async () => {
    ensure.mockResolvedValueOnce(false)
    renderHook(() => useKeepPushFresh())
    await flush()
    window.dispatchEvent(new Event('online'))
    await flush()
    expect(ensure).toHaveBeenCalledTimes(2)
  })

  it('un altre compte a la mateixa sessió es comprova de nou', async () => {
    const { rerender } = renderHook(() => useKeepPushFresh())
    await flush()
    userId = 'u2'
    rerender()
    await flush()
    expect(ensure).toHaveBeenCalledTimes(2)
  })
})
