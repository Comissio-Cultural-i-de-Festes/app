import type { ReadCallback, ResourceKey, Services } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { lazyLocales } from './backend'

/**
 * Every way a language can fail to arrive ends with something on screen.
 *
 * The loaders are fakes, so the cases are the ones a real network produces and
 * a test cannot: a request that never answers, and a chunk that a deploy has
 * deleted.
 */

const EN = { state: { loading: 'One sec…' } }
const MISSING = new TypeError(
  'Failed to fetch dynamically imported module: https://x.test/assets/en-old.js',
)

function setup(load: () => Promise<ResourceKey>) {
  const onLate = vi.fn()
  const reload = vi.fn()
  const backend = lazyLocales({ loaders: { en: load }, timeoutMs: 4000, onLate, reload })
  backend.init({} as Services, {}, {})
  const callback = vi.fn<ReadCallback>()
  backend.read('en', 'translation', callback)
  return { callback, onLate, reload }
}

let online = true

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  online = true
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('a language that is not in the bundle', () => {
  it('is handed over when it arrives in time', async () => {
    const { callback } = setup(() => Promise.resolve(EN))
    await vi.advanceTimersByTimeAsync(0)

    expect(callback).toHaveBeenCalledExactlyOnceWith(null, EN)
  })

  it('gives up after four seconds when the request hangs, so the fallback shows', async () => {
    const { callback } = setup(() => new Promise(() => undefined))

    await vi.advanceTimersByTimeAsync(3999)
    expect(callback).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(callback).toHaveBeenCalledExactlyOnceWith(expect.any(Error), false)
  })

  it('still switches to it if it turns up after giving up', async () => {
    let arrive: (value: ResourceKey) => void = () => undefined
    const { callback, onLate } = setup(
      () =>
        new Promise((resolve) => {
          arrive = resolve
        }),
    )

    await vi.advanceTimersByTimeAsync(4000)
    arrive(EN)
    await vi.advanceTimersByTimeAsync(0)

    expect(callback).toHaveBeenCalledOnce()
    expect(onLate).toHaveBeenCalledExactlyOnceWith('en', EN)
  })

  it('reloads once when a deploy has removed the chunk and there is a connection', async () => {
    const first = setup(() => Promise.reject(MISSING))
    await vi.advanceTimersByTimeAsync(0)

    expect(first.reload).toHaveBeenCalledOnce()
    expect(first.callback).not.toHaveBeenCalled()

    // The reloaded page still cannot find it: no second reload, the fallback.
    const second = setup(() => Promise.reject(MISSING))
    await vi.advanceTimersByTimeAsync(0)

    expect(second.reload).not.toHaveBeenCalled()
    expect(second.callback).toHaveBeenCalledExactlyOnceWith(MISSING, false)
  })

  it('does not reload without a connection, where it would bring nothing', async () => {
    online = false
    const { callback, reload } = setup(() => Promise.reject(MISSING))
    await vi.advanceTimersByTimeAsync(0)

    expect(reload).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalledExactlyOnceWith(MISSING, false)
  })

  it('does not reload for an error that is not a missing chunk', async () => {
    const broken = new SyntaxError('Unexpected token')
    const { callback, reload } = setup(() => Promise.reject(broken))
    await vi.advanceTimersByTimeAsync(0)

    expect(reload).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalledExactlyOnceWith(broken, false)
  })
})
