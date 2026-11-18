import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  SNOOZE_DONE_MS,
  SNOOZE_LATER_MS,
  clearInstallSnooze,
  hasNativeInstallPrompt,
  offersNativeInstall,
  promptNativeInstall,
  shouldOfferInstallCard,
  shouldPromptInstall,
  snoozeInstall,
} from './installGate'

vi.mock('@/lib/platform', () => ({
  isIos: () => mockIsIos,
  inAppBrowser: () => (mockInApp ? 'instagram' : null),
  isStandalone: () => mockIsStandalone,
}))

let mockIsIos = true
let mockIsStandalone = false
let mockInApp = false

const NOW = new Date('2026-09-01T20:00:00Z').getTime()

/** El que Chrome dispara, retallat al que el mòdul en fa servir. */
function offerNativeDialog(outcome: 'accepted' | 'dismissed'): void {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  e.prompt = () => Promise.resolve()
  e.userChoice = Promise.resolve({ outcome })
  window.dispatchEvent(e)
}

beforeEach(() => {
  mockIsIos = true
  mockIsStandalone = false
  mockInApp = false
  localStorage.clear()
})

afterEach(() => {
  clearInstallSnooze()
})

describe('when the install screen appears', () => {
  it('never inside an in-app browser: there is no Safari there to follow its steps', () => {
    mockInApp = true
    expect(shouldPromptInstall(NOW)).toBe(false)
  })

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

  it('steps aside on iOS when the link carries an invitation', () => {
    // El codi només viu a la URL, i la icona obre l'arrel en un magatzem a
    // part: instal·lar primer és perdre'l. La porta va davant i la
    // instal·lació arriba després, com a targeta a l'Inici.
    expect(shouldPromptInstall(NOW, { invited: true })).toBe(false)
    expect(shouldPromptInstall(NOW, { invited: false })).toBe(true)
  })

  it('keeps the Android dialog in front of the door, invitation or not', async () => {
    // A Android instal·lar no canvia de magatzem i la pestanya es queda amb la
    // URL sencera: el codi no es perd, i no hi ha res a arreglar.
    mockIsIos = false
    offerNativeDialog('dismissed')
    expect(shouldPromptInstall(NOW, { invited: true })).toBe(true)
    await promptNativeInstall()
  })
})

describe('the install card on the home screen', () => {
  it('appears on iOS in Safari, once somebody is already in', () => {
    expect(shouldOfferInstallCard(NOW)).toBe(true)
  })

  it('never from the icon, which is where it would send them', () => {
    mockIsStandalone = true
    expect(shouldOfferInstallCard(NOW)).toBe(false)
  })

  it('never inside an in-app browser', () => {
    mockInApp = true
    expect(shouldOfferInstallCard(NOW)).toBe(false)
  })

  it('never off iOS: Android has its own dialog and its own menu entry', () => {
    // Els passos de la targeta són del Safari. A Android, amb o sense diàleg,
    // ensenyar-los seria explicar com es fa en un altre mòbil.
    mockIsIos = false
    expect(shouldOfferInstallCard(NOW)).toBe(false)
  })

  it('shares the snooze with the screen: "not now" is a week, "already done" a month', () => {
    // Una sola resposta per a les dues ofertes. Qui ha dit «ara no» a la
    // pantalla no ha de trobar-se la mateixa pregunta a l'Inici cinc minuts
    // després, i qui diu que ja la té no l'ha de tornar a sentir enlloc.
    snoozeInstall(SNOOZE_LATER_MS, NOW)
    expect(shouldOfferInstallCard(NOW + 1000)).toBe(false)
    expect(shouldOfferInstallCard(NOW + SNOOZE_LATER_MS + 1000)).toBe(true)

    snoozeInstall(SNOOZE_DONE_MS, NOW)
    expect(shouldOfferInstallCard(NOW + SNOOZE_LATER_MS + 1000)).toBe(false)
    expect(shouldOfferInstallCard(NOW + SNOOZE_DONE_MS + 1000)).toBe(true)
  })
})

describe('the native install dialog', () => {
  const offerOne = offerNativeDialog

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
