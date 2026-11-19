import { describe, expect, it } from 'vitest'

import { fallbackLocales } from './locales'

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
