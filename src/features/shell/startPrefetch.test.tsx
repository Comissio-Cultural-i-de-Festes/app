import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { doorKeys } from '@/features/door/api'
import { homeKeys, horizonIso } from '@/features/home/api'
import { useHome } from '@/features/home/useHome'
import { avisosKeys } from '@/features/junta/avisosApi'
import { juntaEventKeys, juntaHorizonIso } from '@/features/junta/eventsApi'
import { juntaHomeKeys } from '@/features/junta/homeApi'
import { horesKeys } from '@/features/junta/horesApi'
import { meetingListKeys } from '@/features/junta/meetingsApi'
import { memberKeys } from '@/features/junta/membersApi'
import { pendentsKeys } from '@/features/junta/pendentsApi'
import { photoKeys } from '@/features/photos/api'
import { profileScreenKeys } from '@/features/profile/api'
import { periodBounds, rankingKeys } from '@/features/ranking/api'
import { UserIdContext } from '@/features/session/context'
import { type MyProfile, profileKeys } from '@/features/session/profile'

import { ComebackLine } from '@/features/profile/ComebackLine'
import { useExitOffer } from '@/features/photos/useExitOffer'
import { JuntaHome } from '@/features/junta/JuntaHome'

import { clearStartHint, readStartHint, writeStartHint } from './startHint'
import { prefetchHome, prefetchJunta } from './startPrefetch'
import { useStartPrefetch } from './useStartPrefetch'

/**
 * L'arrencada en paral·lel, comprovada contra la xarxa i no contra la
 * implementació.
 *
 * El servidor és un doble que anota cada petició. Les pantalles de debò
 * (`useHome`) es munten sobre la cau que ha deixat l'arrencada: si una clau o
 * una funció d'aquí no fos la seva, demanarien una segona vegada el mateix i
 * l'anotació ho diria.
 */

const log = vi.hoisted<string[]>(() => [])
const answers = vi.hoisted<Record<string, unknown>>(() => ({}))

vi.mock('@/lib/supabase', () => {
  const query = (label: string): unknown => {
    const p: unknown = new Proxy(() => undefined, {
      get: (_target, key) =>
        key === 'then'
          ? (done: (value: unknown) => unknown) => done({ data: answers[label] ?? [], error: null })
          : () => p,
    })
    return p
  }
  return {
    AUTH_STORAGE_KEY: 'sb-test-auth-token',
    supabase: {
      from: (table: string) => {
        log.push(table)
        return query(table)
      },
      rpc: (fn: string) => {
        log.push(`rpc/${fn}`)
        return query(`rpc/${fn}`)
      },
    },
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'ca' } }),
}))
vi.mock('@/features/door/decoder', () => ({ warmDecoder: () => Promise.resolve() }))

const ME = 'u-1'
const EVENTS = [
  {
    id: 'e-1',
    titulo: 'Alfa',
    tipo: 'fiesta',
    starts_at: '2026-09-25T19:00:00Z',
    published: true,
    acta: null,
  },
  {
    id: 'e-2',
    titulo: 'Beta',
    tipo: 'fiesta',
    starts_at: '2026-09-26T19:00:00Z',
    published: true,
    acta: null,
  },
]
const PERIODS = [
  {
    codi: 'curs',
    etiqueta: 'Curs',
    mena: 'global',
    ordre: 0,
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: null,
  },
]

function count(label: string): number {
  return log.filter((l) => l === label).length
}

function clientWith(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } })
}

function wrapper(client: QueryClient, path = '/') {
  return function Wrap({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={client}>
          <UserIdContext value={ME}>{children}</UserIdContext>
        </QueryClientProvider>
      </MemoryRouter>
    )
  }
}

beforeEach(() => {
  log.length = 0
  for (const k of Object.keys(answers)) delete answers[k]
  answers.events_public = EVENTS
  answers.ranking_periods = PERIODS
  answers['rpc/junta_home'] = { porta: null, pendents: 0, esborranys: 0, propers: 0, socis: 0 }
  answers['rpc/admin_hores_pendents'] = { activitats: 0 }
  localStorage.clear()
})

describe('prefetchHome', () => {
  it('deixa a la cau el que l’Inici llegeix, amb les claus de l’Inici', async () => {
    const client = clientWith()
    await prefetchHome(client, ME)

    const horizon = horizonIso()
    const bounds = periodBounds(PERIODS[0] as never)
    expect(client.getQueryData(homeKeys.upcoming(horizon))).toEqual(EVENTS)
    expect(client.getQueryData(homeKeys.previous(horizon))).toEqual(EVENTS)
    expect(client.getQueryData(rankingKeys.periods())).toEqual(PERIODS)
    expect(client.getQueryState(photoKeys.nights())?.status).toBe('success')
    expect(client.getQueryState(profileScreenKeys.streak(ME))?.status).toBe('success')
    expect(client.getQueryState(homeKeys.summaries(['e-1', 'e-2', 'e-1', 'e-2']))?.status).toBe(
      'success',
    )
    expect(client.getQueryState(rankingKeys.individual(bounds))?.status).toBe('success')
    expect(client.getQueryState(rankingKeys.schools(bounds))?.status).toBe('success')
  })

  it('només torna a la xarxa pel que no havia demanat: la pantalla troba la resta a la cau', async () => {
    const client = clientWith()
    await prefetchHome(client, ME)
    const before = log.length

    const { result } = renderHook(() => useHome(), { wrapper: wrapper(client) })
    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })
    await waitFor(() => {
      expect(client.getQueryState(profileKeys.of(ME))?.status).toBe('success')
    })

    // El perfil és l'única cosa que `useHome` demana i l'arrencada no.
    expect(log.slice(before)).toEqual(['profiles'])
  })

  it('surt tot el que no penja de res a la primera volta, i la resta a la segona', async () => {
    const client = clientWith()
    await prefetchHome(client, ME)

    const firstWave = ['events_public', 'events_public', 'ranking_periods', 'rpc/my_streak']
    expect(log.slice(0, 4).sort()).toEqual([...firstWave].sort())
    expect(log.slice(4).sort()).toEqual(
      [
        'rpc/my_photos',
        'rpc/ranking_escoles_period',
        'rpc/ranking_period',
        'rpc/resum_assistencies',
      ].sort(),
    )
  })

  it('no demana les nits si no hi ha cap esdeveniment anterior, com useExitOffer', async () => {
    answers.events_public = []
    const client = clientWith()
    await prefetchHome(client, ME)
    expect(count('rpc/my_photos')).toBe(0)
  })

  it('la targeta de la ratxa i la targeta de sortida troben la cau i només demanen el que no és seu', async () => {
    const client = clientWith()
    await prefetchHome(client, ME)
    const before = log.length

    render(<ComebackLine />, { wrapper: wrapper(client) })
    const exit = renderHook(() => useExitOffer(EVENTS[0] as never), { wrapper: wrapper(client) })
    await waitFor(() => {
      expect(client.getQueryState(photoKeys.nights())?.status).toBe('success')
    })
    await new Promise((r) => setTimeout(r, 30))
    expect(exit.result.current).toBeNull()
    expect(log.slice(before)).toEqual([])
  })
})

describe('prefetchJunta', () => {
  it('deixa a la cau l’entrada de la junta, amb les claus de la junta', async () => {
    const client = clientWith()
    await prefetchJunta(client)

    expect(client.getQueryState(juntaHomeKeys.home())?.status).toBe('success')
    expect(client.getQueryState(juntaEventKeys.list(juntaHorizonIso()))?.status).toBe('success')
    expect(client.getQueryState(rankingKeys.periods())?.status).toBe('success')
    expect(client.getQueryState(horesKeys.pendents())?.status).toBe('success')
    expect(client.getQueryState(pendentsKeys.esperen())?.status).toBe('success')
    expect(client.getQueryState(doorKeys.pointValues())?.status).toBe('success')
    expect(client.getQueryState(memberKeys.list())?.status).toBe('success')
    expect(client.getQueryState(meetingListKeys.list())?.status).toBe('success')
    expect(client.getQueryState(avisosKeys.comptes('2026-09-01T00:00:00Z'))?.status).toBe('success')
  })
})

describe("l'entrada de la junta", () => {
  it('la pantalla troba a la cau tot el que l’arrencada ha demanat', async () => {
    const client = clientWith()
    await prefetchJunta(client)
    const before = Object.fromEntries(log.map((l) => [l, count(l)]))

    render(<JuntaHome />, { wrapper: wrapper(client, '/junta') })
    await new Promise((r) => setTimeout(r, 100))

    // Qualsevol cosa que ja s'havia demanat no es torna a demanar. Les que són
    // de blocs de més avall (avisos, tipus) poden aparèixer, i no compten.
    // `profiles` és la llista de socis, que l'arrencada demana, i alhora el
    // perfil propi, que no: aquest és l'únic que s'hi suma.
    for (const label of Object.keys(before)) {
      expect(count(label), label).toBe(
        label === 'profiles' ? (before[label] ?? 0) + 1 : before[label],
      )
    }
  })
})

describe('useStartPrefetch', () => {
  it('per a un soci actiu a l’Inici llança les de l’Inici i cap de la junta', async () => {
    writeStartHint(ME, { estat: 'actiu', role: 'member', escola: true } as never)
    const client = clientWith()
    renderHook(() => useStartPrefetch(undefined), { wrapper: wrapper(client, '/') })

    await waitFor(() => {
      expect(count('rpc/ranking_period')).toBe(1)
    })
    expect(count('rpc/junta_home')).toBe(0)
    expect(count('rpc/admin_hores_pendents')).toBe(0)
  })

  it('un soci que obre /junta no fa cap petició de la junta', async () => {
    writeStartHint(ME, { estat: 'actiu', role: 'member', escola: true } as never)
    const client = clientWith()
    renderHook(() => useStartPrefetch(undefined), { wrapper: wrapper(client, '/junta') })

    await new Promise((r) => setTimeout(r, 30))
    expect(log).toEqual([])
  })

  it('la junta que obre /junta les llança sense esperar el perfil', async () => {
    writeStartHint(ME, { estat: 'actiu', role: 'admin', escola: true } as never)
    const client = clientWith()
    renderHook(() => useStartPrefetch(undefined), { wrapper: wrapper(client, '/junta') })

    await waitFor(() => {
      expect(count('rpc/junta_home')).toBe(1)
    })
    expect(count('rpc/ranking_period')).toBe(0)
  })

  it('un pendent no fa cap petició que la RLS hagi de deixar buida', async () => {
    writeStartHint(ME, { estat: 'pendent', role: 'member', escola: true } as never)
    const client = clientWith()
    renderHook(() => useStartPrefetch(undefined), { wrapper: wrapper(client, '/') })

    await new Promise((r) => setTimeout(r, 30))
    expect(log).toEqual([])
  })

  it('sense pista —el primer cop en aquest mòbil— no avança res, però en deixa una', async () => {
    const client = clientWith()
    const profile = { estat: 'actiu', role: 'member' } as MyProfile
    const { rerender } = renderHook(({ p }) => useStartPrefetch(p), {
      wrapper: wrapper(client, '/'),
      initialProps: { p: undefined as MyProfile | undefined },
    })
    await new Promise((r) => setTimeout(r, 30))
    expect(log).toEqual([])

    rerender({ p: profile })
    expect(localStorage.getItem('comi.start-hint')).toContain('"estat":"actiu"')
  })

  it('un soci actiu sense escola no avança l’Inici: la porta el porta al primer cop', async () => {
    writeStartHint(ME, { estat: 'actiu', role: 'member', escola: null } as never)
    const client = clientWith()
    renderHook(() => useStartPrefetch(undefined), { wrapper: wrapper(client, '/') })

    await new Promise((r) => setTimeout(r, 30))
    expect(log).toEqual([])
  })

  it('la pista s’esborra en tancar sessió', () => {
    writeStartHint(ME, { estat: 'actiu', role: 'admin', escola: 'x' } as never)
    expect(readStartHint(ME)).not.toBeNull()
    clearStartHint()
    expect(readStartHint(ME)).toBeNull()
  })

  it('la pista d’un altre usuari no compta', async () => {
    writeStartHint('un-altre', { estat: 'actiu', role: 'admin', escola: true } as never)
    const client = clientWith()
    renderHook(() => useStartPrefetch(undefined), { wrapper: wrapper(client, '/junta') })

    await new Promise((r) => setTimeout(r, 30))
    expect(log).toEqual([])
  })
})
