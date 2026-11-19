import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Que entrar a la zona de junta demani la porta, i que sense xarxa no ho intenti.
 *
 * Les pantalles es fan passar per mòduls buits que apunten que s'han demanat:
 * el que es comprova és el `import()`, que és el que fa que el service worker
 * guardi el tros.
 */

const requested = vi.hoisted(() => [] as string[])

vi.mock('@/features/junta/JuntaHome', () => (requested.push('JuntaHome'), {}))
vi.mock('./ScannerScreen', () => (requested.push('ScannerScreen'), {}))
vi.mock('./ManualScreen', () => (requested.push('ManualScreen'), {}))
vi.mock('./PointsScreen', () => (requested.push('PointsScreen'), {}))
vi.mock('@/features/junta/GimcanaValidateScreen', () => (requested.push('Gimcana'), {}))
vi.mock('@/features/junta/PaymentsScreen', () => (requested.push('Payments'), {}))
vi.mock('@/features/junta/MembersScreen', () => (requested.push('Members'), {}))
vi.mock('@/features/junta/InvitesScreen', () => (requested.push('Invites'), {}))
vi.mock('@/features/junta/CheckinsScreen', () => (requested.push('Checkins'), {}))
vi.mock('@/i18n/junta', () => ({
  preloadJuntaStrings: () => {
    requested.push('junta strings')
    return Promise.resolve()
  },
}))
vi.mock('./decoder', () => ({
  warmDecoder: () => {
    requested.push('decoder')
    return Promise.resolve()
  },
}))

const { preloadDoor } = await import('./preload')

beforeEach(() => {
  requested.length = 0
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('preloadDoor', () => {
  it('asks for the junta home, what its door block and work rows open, their strings, and the QR decoder', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await preloadDoor()
    expect([...requested].sort()).toEqual(
      [
        'Checkins',
        'Gimcana',
        'Invites',
        'JuntaHome',
        'ManualScreen',
        'Members',
        'Payments',
        'PointsScreen',
        'ScannerScreen',
        'decoder',
        'junta strings',
      ].sort(),
    )
  })

  it('asks for nothing with no signal', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await preloadDoor()
    expect(requested).toEqual([])
  })

  it('asks for every door screen the router loads on demand', () => {
    // Llegit del codi i no de la llista de dalt: una pantalla nova de la porta
    // que entra a `App.tsx` amb `lazy()` i no aquí ha de fer fallar alguna cosa.
    const app = readFileSync('src/App.tsx', 'utf8')
    const preload = readFileSync('src/features/door/preload.ts', 'utf8')
    const routed = [...app.matchAll(/import\('@\/features\/door\/(\w+)'\)/g)].map((m) => m[1])

    expect(routed.length).toBeGreaterThanOrEqual(3)
    // El mapa és el tros més gros, i no surt mai a la porta.
    expect(preload).not.toMatch(/EventFormScreen|GeoMap|GeoPicker/)
    for (const screen of routed) {
      expect(preload, `${screen} is lazy in App.tsx and not preloaded`).toMatch(
        new RegExp(`import\\('(?:\\./|@/features/door/)${screen}'\\)`),
      )
    }
  })
})
