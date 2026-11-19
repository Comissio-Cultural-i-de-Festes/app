import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DETECTION, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, fallbackLocales } from './locales'

/**
 * The fallback chain always ends in the language that is in the bundle, so a
 * default that cannot be fetched still leaves words on screen and not keys.
 */
describe('fallbackLocales', () => {
  it('is just Catalan when Catalan is the default', () => {
    expect(fallbackLocales('ca')).toEqual(['ca'])
  })

  it('ends in Catalan when the default is another language', () => {
    expect(fallbackLocales('es')).toEqual(['es', 'ca'])
    expect(fallbackLocales('en')).toEqual(['en', 'ca'])
  })
})

/**
 * What the detector stores is what the backend can load: `es`, never the
 * browser's `es-ES`. A long tag in `comi.locale` read back as the language
 * asked for, and the chunk that arrived late was then never recognised as it.
 */
describe('DETECTION', () => {
  const phone = async () => {
    const instance = i18next.createInstance()
    await instance.use(LanguageDetector).init({
      detection: DETECTION,
      resources: { ca: { translation: {} } },
      partialBundledLanguages: true,
      supportedLngs: [...SUPPORTED_LOCALES],
      fallbackLng: ['ca'],
      load: 'languageOnly',
      nonExplicitSupportedLngs: true,
    })
    return instance
  }

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('turns the browser’s es-ES into es, and stores es', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-ES'])
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES')

    const i18n = await phone()

    expect(i18n.language).toBe('es')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('es')
  })

  it('repairs an en-GB stored before, and keeps a stored choice over the browser', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en-GB')
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-ES'])

    const i18n = await phone()

    expect(i18n.language).toBe('en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
  })
})
