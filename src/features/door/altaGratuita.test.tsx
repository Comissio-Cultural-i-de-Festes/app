import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type * as ApiModuleType from './api'
import type { CheckInResult, RosterRow } from './api'

type ApiModule = typeof ApiModuleType

/**
 * L'ALTRA MEITAT DE LA PORTA, a una activitat de franc.
 *
 * VA NÉIXER VERMELLA I ARA ÉS VERDA. Documentava el cas que la issue #9 diu
 * que no ha de passar i que la primera ronda d'arreglaments va deixar viu a la
 * segona pantalla; es queda aquí perquè és l'única cosa que impedeix que hi
 * torni.
 *
 * `ScannerScreen` ja triava les paraules amb `verdictText`, que mira el preu i
 * calla quan no hi ha res a cobrar. `ManualScreen` no: pintava
 * `presentationOf(outcome).messageKey` tal qual, i per a `ok_walkin_review`
 * aquella clau és `scanner.okWalkinReview` —«Entra, però no estava apuntat ni
 * ha pagat»—. `check_in` torna aquest estat sempre que algú no apuntat entra a
 * un esdeveniment amb places comptades, encara que `precio_cents` sigui zero
 * (`v_free := plazas is null and precio_cents = 0`), o sigui que l'alta pel nom
 * acusava d'un deute que no existeix. Sortia dues vegades: a la tira de l'últim
 * fitxat i a la fila que s'acaba de tocar, i aquí es miren totes dues.
 *
 * Vist al navegador el 19 de setembre de 2026 a 390x844, a l'esdeveniment
 * «Quiz Bravo» (`precio_cents = 0`, `plazas = 20`), en castellà i en anglès:
 *
 *   ÚLTIMO FICHADO / November / Let them in — not signed up and not paid
 *
 * La pantalla ja tenia el preu a la mà: cridava `fetchEvent` i només en feia
 * servir el títol.
 *
 * L'arreglament: les paraules d'aquesta pantalla passen pel mateix lloc que
 * les de l'escàner, que és `statusWords` a `verdict.ts`, en comptes de llegir
 * `messageKey` directament.
 */

const EVENT = '00000000-0000-4000-8000-0000000000e6'
const QUI = '00000000-0000-4000-8000-0000000000d6'

const RESULTAT: CheckInResult = {
  status: 'ok_walkin_review',
  user_id: QUI,
  nombre: 'November',
  escola: 'salut',
  curs: null,
  pagado: false,
  was_registered: false,
  points_awarded: 10,
}

vi.mock('react-i18next', () => ({
  // Les claus, sense traduir: el que es prova és quina frase es tria, no com
  // sona. Amb el text traduït la prova hauria de comparar castellà.
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'ca' } }),
}))

vi.mock('react-router', () => ({
  useParams: () => ({ eventId: EVENT }),
  Link: ({ children }: { readonly children: ReactNode }) => <a href="#">{children}</a>,
}))

vi.mock('@/features/event/api', () => ({
  eventKeys: { one: (id: string) => ['event', id] as const },
  // Zero cèntims: no hi ha res a cobrar i la porta no ho hauria de dir.
  fetchEvent: () => Promise.resolve({ id: EVENT, titulo: 'Quiz inventat', precio_cents: 0 }),
}))

const LLISTA: RosterRow[] = [
  {
    user_id: QUI,
    nombre: 'November',
    escola: 'salut',
    curs: null,
    estado: null,
    pagado: null,
    checked_in: false,
  },
]

vi.mock('./api', async (importOriginal) => {
  const real = await importOriginal<ApiModule>()
  return {
    ...real,
    fetchRoster: () => Promise.resolve(LLISTA),
    scan: () => Promise.resolve(RESULTAT),
    flushQueue: () => Promise.resolve({ sent: 0, left: 0 }),
  }
})

const { ManualScreen } = await import('./ManualScreen')

function munta(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ManualScreen />
    </QueryClientProvider>,
  )
}

describe('l’alta pel nom a una activitat de franc', () => {
  it('no diu que ningú deu res quan no hi ha res a deure', async () => {
    munta()

    // Qui no està apuntat no surt a la llista de sortida: es busca pel nom,
    // que és per a què serveix aquesta pantalla.
    const cerca = await screen.findByRole('searchbox')
    fireEvent.change(cerca, { target: { value: 'November' } })

    const boto = await screen.findByRole('button', { name: /November/ })
    fireEvent.click(boto)

    const tira = await waitFor(() => {
      const el = document.querySelector('[role="status"]')
      if (el === null) throw new Error('encara no hi ha la tira de l’últim fitxat')
      return el
    })

    // `scanner.okWalkinReview` és «Entra, però no estava apuntat ni ha pagat».
    // A zero cèntims hi va la germana sense diners, que és la que l'escàner ja
    // tria des de l'arreglament d'aquesta issue.
    expect(tira.textContent).toContain('scanner.okWalkinReviewFree')
  })

  // L'ALTRA VEGADA QUE SORTIA, que la prova de sobre no toca: la fila torna a
  // dir el veredicte un cop tocada, i les dues venien del mateix `messageKey`.
  // Arreglar-ne una i deixar l'altra és exactament el que va passar entre les
  // dues pantalles de la porta.
  it('ni ho diu la fila que s’acaba de tocar', async () => {
    munta()

    const cerca = await screen.findByRole('searchbox')
    fireEvent.change(cerca, { target: { value: 'November' } })

    const boto = await screen.findByRole('button', { name: /November/ })
    fireEvent.click(boto)

    await waitFor(() => {
      expect(boto.textContent).toContain('scanner.okWalkinReviewFree')
    })
    // La clau de diners és prefix de la de franc, o sigui que `not.toContain`
    // no serviria: el que no hi pot ser és `scanner.okWalkinReview` tot sol.
    expect(boto.textContent).not.toMatch(/scanner\.okWalkinReview(?![A-Za-z])/)
  })
})
