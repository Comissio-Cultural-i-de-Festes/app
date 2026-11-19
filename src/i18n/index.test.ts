import { afterAll, describe, expect, it } from 'vitest'

import i18n from '@/i18n'

import ca from './locales/ca.json'
import en from './locales/en.json'
import es from './locales/es.json'

/**
 * One language in the bundle, the other two on request.
 *
 * What ends up in which chunk is a property of the build and is measured there;
 * what this pins down is the half that can break quietly in the code: that
 * i18next really does go and fetch a language it was not handed, and that
 * switching to it waits for it rather than painting keys or the fallback.
 */

afterAll(async () => {
  await i18n.changeLanguage('ca')
})

describe('the languages', () => {
  it('starts with Catalan in memory and Spanish not', () => {
    expect(i18n.getResourceBundle('ca', 'translation')).toEqual(ca)
    expect(i18n.hasResourceBundle('es', 'translation')).toBe(false)
  })

  it('fetches Spanish when somebody switches to it, and only then answers', async () => {
    await i18n.changeLanguage('es')

    expect(i18n.resolvedLanguage).toBe('es')
    expect(i18n.t('state.loading')).toBe(es.state.loading)
  })

  it('does the same for English', async () => {
    await i18n.changeLanguage('en')

    expect(i18n.resolvedLanguage).toBe('en')
    expect(i18n.t('state.loading')).toBe(en.state.loading)
    expect(document.documentElement.lang).toBe('en')
  })
})
