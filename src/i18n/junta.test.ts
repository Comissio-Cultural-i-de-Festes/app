import { createInstance, type ResourceKey } from 'i18next'
import { describe, expect, it, vi } from 'vitest'

import { juntaStrings, juntaStringsFrom } from './junta'
import { SUPPORTED_LOCALES } from './locales'
import ca from './locales/ca.json'
import en from './locales/en.json'
import es from './locales/es.json'

/**
 * The desk strings arrive, land beside the rest, and a failure is not kept.
 *
 * The last case uses the real chunks, cut by the real build plugin: what the
 * bundle carries plus what this fetches has to be the whole file, in all three
 * languages, or some screen shows a raw key.
 */

const whole = { ca, es, en } as const

const app = import.meta.glob<ResourceKey>('./locales/*.json', {
  query: '?app',
  import: 'default',
  eager: true,
})

async function instance(language: string, resources: ResourceKey) {
  const i18n = createInstance()
  await i18n.init({ lng: language, resources: { [language]: { translation: resources } } })
  return i18n
}

describe('the junta strings', () => {
  it('land beside the junta keys the bundle already had', async () => {
    const i18n = await instance('ca', { junta: { title: 'Junta' } })
    const load = juntaStringsFrom({
      ca: () => Promise.resolve({ junta: { audit: { heading: 'Registre' } } }),
    })

    await load(i18n, 'ca')

    expect(i18n.t('junta.title')).toBe('Junta')
    expect(i18n.t('junta.audit.heading')).toBe('Registre')
  })

  it('are fetched once per language, and every caller gets the same promise', async () => {
    const i18n = await instance('ca', {})
    const fetch = vi.fn(() => Promise.resolve({ junta: {} }))
    const load = juntaStringsFrom({ ca: fetch })

    const first = load(i18n, 'ca')
    expect(load(i18n, 'ca')).toBe(first)
    await first

    expect(fetch).toHaveBeenCalledOnce()
  })

  it('try again after a failure instead of handing the old error back', async () => {
    const i18n = await instance('ca', {})
    const missing = new TypeError('Failed to fetch dynamically imported module')
    const fetch = vi
      .fn<() => Promise<ResourceKey>>()
      .mockRejectedValueOnce(missing)
      .mockResolvedValueOnce({ junta: { audit: { heading: 'Registre' } } })
    const load = juntaStringsFrom({ ca: fetch })

    await expect(load(i18n, 'ca')).rejects.toBe(missing)
    await load(i18n, 'ca')

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(i18n.t('junta.audit.heading')).toBe('Registre')
  })

  it('ask for nothing in a language there is no file for', async () => {
    const i18n = await instance('ca', {})
    await expect(juntaStringsFrom({})(i18n, 'cimode')).resolves.toBeUndefined()
  })

  it.each(SUPPORTED_LOCALES)('make up the whole of %s.json with what the bundle has', async (l) => {
    const bundled = app[`./locales/${l}.json`]
    expect(bundled).toBeDefined()
    const i18n = await instance(l, bundled ?? {})
    const before = JSON.stringify(i18n.getResourceBundle(l, 'translation'))

    await juntaStrings(i18n, l)

    // Something was really left behind, and it really came back.
    expect(JSON.stringify(whole[l]).length - before.length).toBeGreaterThan(10_000)
    expect(i18n.getResourceBundle(l, 'translation')).toEqual(whole[l])
  })
})
