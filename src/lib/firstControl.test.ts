import { describe, expect, it, vi } from 'vitest'

import { assetsToKeep, keepWhatCameFirst } from './firstControl'

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

function container(controller: object | null) {
  const target = new EventTarget()
  return Object.assign(target, { controller })
}

describe('keepWhatCameFirst', () => {
  it('asks again for what loaded before the worker was in charge, once it is', async () => {
    const sw = container(null)
    const fetch = vi.fn(() => Promise.resolve(new Response('')))
    keepWhatCameFirst({
      container: sw,
      loaded: () => [`${ORIGIN}/assets/es-A.js`, `${ORIGIN}/index.html`],
      origin: ORIGIN,
      fetch,
    })

    expect(fetch).not.toHaveBeenCalled()
    sw.dispatchEvent(new Event('controllerchange'))
    sw.dispatchEvent(new Event('controllerchange'))
    await Promise.resolve()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(`${ORIGIN}/assets/es-A.js`)
  })

  it('reads what loaded at the moment the worker takes over, not before', () => {
    const sw = container(null)
    const fetch = vi.fn(() => Promise.resolve(new Response('')))
    const loaded = [`${ORIGIN}/assets/index-A.js`]
    keepWhatCameFirst({ container: sw, loaded: () => loaded, origin: ORIGIN, fetch })

    loaded.push(`${ORIGIN}/assets/en-B.js`)
    sw.dispatchEvent(new Event('controllerchange'))

    expect(fetch.mock.calls).toEqual([
      [`${ORIGIN}/assets/index-A.js`],
      [`${ORIGIN}/assets/en-B.js`],
    ])
  })

  it('does nothing when a worker already serves the page', () => {
    const sw = container({})
    const fetch = vi.fn(() => Promise.resolve(new Response('')))
    keepWhatCameFirst({
      container: sw,
      loaded: () => [`${ORIGIN}/assets/es-A.js`],
      origin: ORIGIN,
      fetch,
    })

    sw.dispatchEvent(new Event('controllerchange'))

    expect(fetch).not.toHaveBeenCalled()
  })

  it('swallows a request that fails: the next visit with a signal stores it', async () => {
    const sw = container(null)
    const fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    keepWhatCameFirst({
      container: sw,
      loaded: () => [`${ORIGIN}/assets/es-A.js`],
      origin: ORIGIN,
      fetch,
    })

    sw.dispatchEvent(new Event('controllerchange'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
