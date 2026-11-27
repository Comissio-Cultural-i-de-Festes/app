import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as GimcanaApi from '@/features/gimcana/api'

import { GimcanaTeamsBlock } from './GimcanaTeamsBlock'

/**
 * Repartir equips tocant noms.
 *
 * Es vigila el que la junta veu i el que surt cap al servidor: un toc posa,
 * mou o treu; l'últim canvi es desfà; i si el servidor diu que no, la fila
 * torna on era en comptes de quedar-se mentint.
 *
 * Gent i equips inventats.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: Record<string, unknown>) =>
      o === undefined ? key : `${key}${JSON.stringify(o)}`,
    i18n: { resolvedLanguage: 'ca', language: 'ca', exists: () => false },
  }),
}))

vi.mock('@/ui/Avatar/Avatar', () => ({ Avatar: () => null }))

const setTeam = vi.fn<(g: string, u: string, e: string | null) => Promise<string>>()

const TEAMS: GimcanaApi.TeamRow[] = [
  { id: 'blau', nom: 'Blau', escola: null, quants: 0, meu: false, ordre: 1 },
  { id: 'verd', nom: 'Verd', escola: null, quants: 0, meu: false, ordre: 2 },
]

let PEOPLE: GimcanaApi.PersonRow[] = []

vi.mock('@/features/gimcana/api', async (original) => {
  const real = await original<typeof GimcanaApi>()
  return {
    ...real,
    fetchTeams: () => Promise.resolve(TEAMS),
    fetchPeople: () => Promise.resolve(PEOPLE.map((p) => ({ ...p }))),
    setTeam: (g: string, u: string, e: string | null) => setTeam(g, u, e),
  }
})

function persona(user_id: string, nombre: string, equip_id: string | null): GimcanaApi.PersonRow {
  return { user_id, nombre, avatar_url: null, equip_id, ha_arribat: true, fotos: 0 }
}

afterEach(() => {
  vi.clearAllMocks()
})

/** El servidor desa de debò: la llista que torna a llegir ja porta el canvi. */
function serverAccepts(): void {
  setTeam.mockImplementation((_g, u, e) => {
    PEOPLE = PEOPLE.map((p) => (p.user_id === u ? { ...p, equip_id: e } : p))
    return Promise.resolve('fet')
  })
}

function munta() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GimcanaTeamsBlock gimcanaId="g1" eventId="ev1" header={<p>capçalera</p>} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function fila(nom: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(nom) })
}

describe('repartir equips', () => {
  it('l’equip actiu és el primer, i tocar algú sense equip l’hi posa', async () => {
    PEOPLE = [persona('aina', 'Aina Roig', null)]
    serverAccepts()
    munta()

    await screen.findByText('Aina Roig')
    expect(screen.getByRole('button', { name: /^Blau/ })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(fila('Aina Roig'))

    await waitFor(() => {
      expect(setTeam).toHaveBeenCalledWith('g1', 'aina', 'blau')
    })
    await waitFor(() => {
      expect(fila('Aina Roig')).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('amb un altre equip actiu, tocar algú el mou a aquell', async () => {
    PEOPLE = [persona('aina', 'Aina Roig', 'blau')]
    serverAccepts()
    munta()

    await screen.findByText('Aina Roig')
    fireEvent.click(screen.getByRole('button', { name: /^Verd/ }))
    fireEvent.click(fila('Aina Roig'))

    await waitFor(() => {
      expect(setTeam).toHaveBeenCalledWith('g1', 'aina', 'verd')
    })
  })

  it('tocar algú que ja és a l’equip actiu el treu', async () => {
    PEOPLE = [persona('aina', 'Aina Roig', 'blau')]
    serverAccepts()
    munta()

    await screen.findByText('Aina Roig')
    expect(fila('Aina Roig')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(fila('Aina Roig'))

    await waitFor(() => {
      expect(setTeam).toHaveBeenCalledWith('g1', 'aina', null)
    })
    await waitFor(() => {
      expect(fila('Aina Roig')).toHaveAttribute('aria-pressed', 'false')
    })
  })

  it('l’últim canvi es desfà d’un toc, i torna on era', async () => {
    PEOPLE = [persona('aina', 'Aina Roig', 'verd')]
    serverAccepts()
    munta()

    await screen.findByText('Aina Roig')
    fireEvent.click(fila('Aina Roig'))
    const strip = await screen.findByRole('status')
    expect(strip).toHaveTextContent('junta.gimcana.movedTo')

    fireEvent.click(within(strip).getByRole('button', { name: 'actions.undo' }))

    await waitFor(() => {
      expect(setTeam).toHaveBeenLastCalledWith('g1', 'aina', 'verd')
    })
    expect(screen.getByRole('status')).toHaveTextContent('junta.gimcana.undone')
  })

  it('si el servidor diu que no, la fila torna on era i es diu per què', async () => {
    PEOPLE = [persona('aina', 'Aina Roig', null)]
    setTeam.mockResolvedValue('no_hi_es')
    munta()

    await screen.findByText('Aina Roig')
    fireEvent.click(fila('Aina Roig'))

    expect(await screen.findByRole('alert')).toHaveTextContent('junta.gimcana.teamsStale')
    expect(fila('Aina Roig')).toHaveAttribute('aria-pressed', 'false')
  })

  it('si la crida falla, la fila també torna on era', async () => {
    PEOPLE = [persona('aina', 'Aina Roig', null)]
    setTeam.mockRejectedValue(new Error('xarxa'))
    munta()

    await screen.findByText('Aina Roig')
    fireEvent.click(fila('Aina Roig'))

    await screen.findByRole('alert')
    expect(fila('Aina Roig')).toHaveAttribute('aria-pressed', 'false')
  })

  it('el filtre «sense equip» amaga qui ja en té', async () => {
    PEOPLE = [persona('aina', 'Aina Roig', 'blau'), persona('bernat', 'Bernat Puig', null)]
    munta()

    await screen.findByText('Aina Roig')
    fireEvent.click(screen.getByRole('button', { name: /junta.gimcana.filterFree/ }))

    expect(screen.queryByText('Aina Roig')).toBeNull()
    expect(screen.getByText('Bernat Puig')).toBeInTheDocument()
  })

  it('els comptadors dels equips segueixen els tocs', async () => {
    PEOPLE = [persona('aina', 'Aina Roig', null)]
    serverAccepts()
    munta()

    await screen.findByText('Aina Roig')
    expect(screen.getByRole('button', { name: /^Blau/ })).toHaveTextContent('"count":0')
    fireEvent.click(fila('Aina Roig'))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Blau/ })).toHaveTextContent('"count":1')
    })
  })
})
