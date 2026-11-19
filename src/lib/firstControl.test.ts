import { describe, expect, it, vi } from 'vitest'

import { assetsToKeep, keepWhatCameFirst, type Resource } from './firstControl'

const ORIGIN = 'https://app.example.test'

describe('assetsToKeep', () => {
  it('keeps the same-origin scripts and stylesheets under /assets/, once each', () => {
    expect(
      assetsToKeep(
        [
          `${ORIGIN}/assets/es-AbCd1234.js`,
          `${ORIGIN}/assets/index-Ef56.css`,
          `${ORIGIN}/assets/es-AbCd1234.js`,
          `${ORIGIN}/assets/archivo-latin.woff2`,
          `${ORIGIN}/index.html`,
          `${ORIGIN}/sw.js`,
          `${ORIGIN}/assets/qr.wasm`,
          'http://127.0.0.1:54321/rest/v1/events?select=*',
          'https://elsewhere.example.test/assets/x.js',
          'not a url',
        ],
        ORIGIN,
      ),
    ).toEqual([`${ORIGIN}/assets/es-AbCd1234.js`, `${ORIGIN}/assets/index-Ef56.css`])
  })
})

interface Setup {
  readonly controller?: object | null
  readonly loaded?: () => readonly Resource[]
  readonly fetch?: () => Promise<unknown>
}

/** A page whose resources, worker and clock the test moves by hand. */
function page({ controller = null, loaded = () => [], fetch: answer }: Setup = {}) {
  const sw = Object.assign(new EventTarget(), { controller })
  const fetch = vi.fn<(url: string) => Promise<unknown>>(
    answer ?? (() => Promise.resolve(new Response(''))),
  )
  let listener: ((entries: readonly Resource[]) => void) | undefined
  let clock = 0
  keepWhatCameFirst({
    container: sw,
    loaded,
    later: (l) => {
      listener = l
    },
    now: () => clock,
    origin: ORIGIN,
    fetch,
  })
  return {
    fetch,
    control: (at: number) => {
      clock = at
      sw.dispatchEvent(new Event('controllerchange'))
    },
    finish: (...entries: Resource[]) => listener?.(entries),
    observing: () => listener !== undefined,
  }
}

const at = (path: string, startTime: number): Resource => ({
  name: `${ORIGIN}${path}`,
  startTime,
})

describe('keepWhatCameFirst', () => {
  it('asks again for what loaded before the worker was in charge, once it is', () => {
    const p = page({ loaded: () => [at('/assets/es-A.js', 10), at('/index.html', 0)] })

    expect(p.fetch).not.toHaveBeenCalled()
    p.control(500)
    p.control(600)

    expect(p.fetch.mock.calls).toEqual([[`${ORIGIN}/assets/es-A.js`]])
  })

  it('reads what loaded at the moment the worker takes over, not before', () => {
    const loaded = [at('/assets/index-A.js', 5)]
    const p = page({ loaded: () => loaded })

    loaded.push(at('/assets/en-B.js', 40))
    p.control(500)

    expect(p.fetch.mock.calls).toEqual([
      [`${ORIGIN}/assets/index-A.js`],
      [`${ORIGIN}/assets/en-B.js`],
    ])
  })

  it('also asks for what was still on its way when the worker took over', () => {
    // El castellà en una xarxa lenta: ha sortit abans del control, i acaba
    // després. Aquella petició no ha passat pel service worker.
    const p = page({ loaded: () => [at('/assets/index-A.js', 5)] })
    p.control(500)

    p.finish(at('/assets/es-A.js', 120), at('/assets/Ideas-B.js', 800))

    expect(p.fetch.mock.calls).toEqual([
      [`${ORIGIN}/assets/index-A.js`],
      [`${ORIGIN}/assets/es-A.js`],
    ])
  })

  it('does not ask twice for the same file', () => {
    const p = page({ loaded: () => [at('/assets/es-A.js', 5)] })
    p.control(500)

    p.finish(at('/assets/es-A.js', 5))

    expect(p.fetch).toHaveBeenCalledTimes(1)
  })

  it('does nothing when a worker already serves the page', () => {
    const p = page({ controller: {}, loaded: () => [at('/assets/es-A.js', 5)] })

    p.control(500)

    expect(p.fetch).not.toHaveBeenCalled()
    expect(p.observing()).toBe(false)
  })

  it('swallows a request that fails: the next visit with a signal stores it', async () => {
    const p = page({
      loaded: () => [at('/assets/es-A.js', 5)],
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
    })

    p.control(500)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(p.fetch).toHaveBeenCalledTimes(1)
  })
})
