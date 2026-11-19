import i18next, { type ResourceKey } from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { lazyLocales } from './backend'
import { adoptLateLocale } from './late'

/**
 * A language that turns up after the timeout takes the screen over by itself.
 *
 * A real i18next and the real backend, with a loader that answers after six
 * seconds: the phone has already been showing Catalan for two of them. The
 * case that broke was a phone whose language is `es-ES`, which is what the
 * browser reports, while the chunk that arrives is `es`.
 */

const CA = { state: { loading: 'Un segon…' } }
const ES = { state: { loading: 'Un segundo…' } }

function phone(lng: string) {
  const instance = i18next.createInstance()
  const backend = lazyLocales({
    loaders: {
      es: () =>
        new Promise<ResourceKey>((resolve) =>
          setTimeout(() => {
            resolve(ES)
          }, 6000),
        ),
    },
    timeoutMs: 4000,
    onLate: (language, resources) => {
      adoptLateLocale(instance, language, resources)
    },
    reload: vi.fn(),
  })
  void instance.use(backend).init({
    lng,
    resources: { ca: { translation: CA } },
    partialBundledLanguages: true,
    supportedLngs: ['ca', 'es', 'en'],
    fallbackLng: ['ca'],
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
  })
  return instance
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('adoptLateLocale', () => {
  it.each(['es', 'es-ES'])(
    'switches a phone in %s to Spanish when it arrives late',
    async (lng) => {
      const i18n = phone(lng)
      const changed = vi.fn()
      i18n.on('languageChanged', changed)

      await vi.advanceTimersByTimeAsync(4000)
      expect(i18n.resolvedLanguage).toBe('ca')
      expect(i18n.t('state.loading')).toBe(CA.state.loading)

      await vi.advanceTimersByTimeAsync(2000)
      expect(i18n.resolvedLanguage).toBe('es')
      expect(i18n.t('state.loading')).toBe(ES.state.loading)
      expect(changed).toHaveBeenCalled()
    },
  )

  it('keeps somebody who reads Catalan in Catalan', async () => {
    const i18n = phone('ca')
    const changed = vi.fn()
    i18n.on('languageChanged', changed)
    await vi.advanceTimersByTimeAsync(0)

    adoptLateLocale(i18n, 'es', ES)
    await vi.advanceTimersByTimeAsync(0)

    expect(i18n.resolvedLanguage).toBe('ca')
    expect(changed).not.toHaveBeenCalled()
  })
})
