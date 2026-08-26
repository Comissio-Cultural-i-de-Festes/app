import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  SNOOZE_DONE_MS,
  SNOOZE_LATER_MS,
  clearInstallSnooze,
  hasNativeInstallPrompt,
  offersNativeInstall,
  promptNativeInstall,
  shouldPromptInstall,
  snoozeInstall,
} from './installGate'

vi.mock('@/lib/platform', () => ({
  isIos: () => mockIsIos,
  isStandalone: () => mockIsStandalone,
}))

let mockIsIos = true
let mockIsStandalone = false

const NOW = new Date('2026-09-01T20:00:00Z').getTime()

beforeEach(() => {
  mockIsIos = true
  mockIsStandalone = false
  localStorage.clear()
})

afterEach(() => {
  clearInstallSnooze()
})

describe('when the install screen appears', () => {
  it('waits a week after "not now" and a month after "already done"', () => {
    // Pinned, because the tests below measure against these same constants and
    // would happily pass with any value at all. A week is short enough to
    // catch somebody before the first event and long enough not to nag.
    const day = 24 * 60 * 60 * 1000
    expect(SNOOZE_LATER_MS).toBe(7 * day)
    expect(SNOOZE_DONE_MS).toBe(30 * day)
  })

  it('appears on iOS in Safari, which is the whole point of it', () => {
    expect(shouldPromptInstall(NOW)).toBe(true)
  })

  it('never appears once the app is running from the icon', () => {
    mockIsStandalone = true
    expect(shouldPromptInstall(NOW)).toBe(false)
  })

  it('never appears anywhere but iOS', () => {
    // Android and desktop have their own install affordances, and the two
    // mock-ups on the screen are of Safari specifically.
    mockIsIos = false
    expect(shouldPromptInstall(NOW)).toBe(false)
  })

  it('goes quiet for a week after "not now", then comes back', () => {
    snoozeInstall(SNOOZE_LATER_MS, NOW)

    expect(shouldPromptInstall(NOW)).toBe(false)
    expect(shouldPromptInstall(NOW + SNOOZE_LATER_MS - 1000)).toBe(false)
    // Back before the first event, which is the point of a week rather than
    // never: plenty of people dismiss it on day one without reading it.
    expect(shouldPromptInstall(NOW + SNOOZE_LATER_MS + 1000)).toBe(true)
  })

  it('goes quiet for longer after "already done"', () => {
    // We cannot verify the claim from Safari. If it is true the icon is
    // standalone and never asks again anyway, so taking their word costs
    // nothing.
    snoozeInstall(SNOOZE_DONE_MS, NOW)
    expect(shouldPromptInstall(NOW + SNOOZE_LATER_MS + 1000)).toBe(false)
    expect(shouldPromptInstall(NOW + SNOOZE_DONE_MS + 1000)).toBe(true)
  })

  it('still appears when storage is unavailable', () => {
    // Private browsing, or a browser set to block site data. Losing the
    // snooze is a mild annoyance; hiding the screen that decides whether
    // anybody ends up with the app is not.
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => {
      snoozeInstall(SNOOZE_LATER_MS, NOW)
    }).not.toThrow()
    expect(shouldPromptInstall(NOW)).toBe(true)

    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('ignores a snooze value that is not a number', () => {
    localStorage.setItem('comi.install.snoozedUntil', 'whenever')
    expect(shouldPromptInstall(NOW)).toBe(true)
  })
})

describe('the native install dialog', () => {
  /** El que Chrome dispara, retallat al que el mòdul en fa servir. */
  function offerOne(outcome: 'accepted' | 'dismissed'): void {
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
    }
    e.prompt = () => Promise.resolve()
    e.userChoice = Promise.resolve({ outcome })
    window.dispatchEvent(e)
  }

  it('separates having a dialog in hand from being a browser that offers one', async () => {
    // Aquesta és la distinció sencera. `deferred` es gasta en obrir-lo; el fet
    // que aquest navegador instal·li apps, no. Amb la branca de la pantalla
    // penjada del primer, descartar el diàleg i tornar a muntar li ensenyava a
    // un Android els dos passos del Safari i l'avís de tornar a entrar, cap
    // dels dos cert al seu mòbil.
    offerOne('dismissed')
    expect(hasNativeInstallPrompt()).toBe(true)
    expect(offersNativeInstall()).toBe(true)

    await promptNativeInstall()

    expect(hasNativeInstallPrompt(), 'el diàleg es gasta').toBe(false)
    expect(offersNativeInstall(), 'el navegador no deixa de ser qui és').toBe(true)
  })

  it('will not open a dialog it no longer has', async () => {
    expect(await promptNativeInstall()).toBe(false)
  })
})
