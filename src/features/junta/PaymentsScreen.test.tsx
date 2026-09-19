import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EventRow } from '@/lib/schema'

import type * as EventsApiType from './eventsApi'
import type * as PaymentsApiType from './paymentsApi'
import type { AttendeeRow } from './paymentsApi'

/**
 * Els tres estats de la pantalla de pagaments que no són «aquí tens la llista».
 *
 * Tots tres eren arreglaments sense cap prova al darrere: es podien revertir
 * sencers i les proves seguien verdes, que és el mateix que no tenir-ne. Els
 * tres diuen una cosa sobre gent i diners amb el que encara no se sap, i és
 * exactament on una pantalla es pot equivocar sense que es noti:
 *
 *   - amb la consulta d'apuntats en vol o petada, `rows` arriba buida i a la
 *     branca de franc aquell número ÉS la gent: «QUI VE / 0 / que han dit que
 *     sí» és un zero indistingible de la veritat;
 *   - amb un id que ja no és a la llista de la junta, «encara no hi ha res al
 *     calendari» ho desmenteix el selector de set esdeveniments de just a sobre;
 *   - i aquell selector, amb un `value` que no és cap de les seves opcions,
 *     ensenya la PRIMERA com si estigués triada, o sigui que el títol de dalt
 *     i el cos de sota parlen de dos esdeveniments diferents.
 *
 * Es munta la pantalla sencera i no cap tros: les tres decisions són `if`s dins
 * de la JSX i el que es prova és què es llegeix, no quina branca s'ha pres.
 */

const EVENT_A = '00000000-0000-4000-8000-00000000ea01'
const EVENT_B = '00000000-0000-4000-8000-00000000ea02'
const FORA = '00000000-0000-4000-8000-00000000ea99'

/** Una fila d'`events_public` sencera, perquè `EventRow` no admet forats. */
const BASE: EventRow = {
  a_la_uni: false,
  abast: 'tots',
  acta: null,
  cal_confirmacio: true,
  cover_url: null,
  created_at: '2026-09-01T10:00:00.000Z',
  created_by: null,
  descripcion: null,
  ends_at: null,
  hores_verificat_at: null,
  hores_verificat_per: null,
  id: EVENT_A,
  minuts_memoria: 0,
  plazas: null,
  precio_cents: 0,
  published: true,
  puntos: 10,
  reveal_at: null,
  revelat: true,
  starts_at: '2026-09-25T19:00:00.000Z',
  tancada_at: null,
  te_cotxes: false,
  teaser: null,
  tipo: 'festa',
  titulo: 'Festa Alfa',
  transport_info: null,
  ubicacion: null,
}

const LLISTA: readonly EventRow[] = [
  BASE,
  { ...BASE, id: EVENT_B, titulo: 'Sopar Bravo', starts_at: '2026-09-27T20:00:00.000Z' },
]

/** Qui hi ha a la URL, per prova. */
let params: { readonly eventId?: string } = {}
/** Què torna la llista d'esdeveniments, per prova. */
let events: () => Promise<EventRow[]> = () => Promise.resolve([...LLISTA])
/** Què torna la llista d'apuntats, per prova. */
let attendees: () => Promise<AttendeeRow[]> = () => Promise.resolve([])

vi.mock('react-i18next', () => ({
  // Les claus, sense traduir: el que es prova és quina frase es tria.
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'ca' } }),
}))

vi.mock('react-router', () => ({
  useParams: () => params,
  useNavigate: () => () => Promise.resolve(),
  useLocation: () => ({ pathname: '/junta/pagaments', search: '' }),
  Link: ({ children }: { readonly children: ReactNode }) => <a href="#">{children}</a>,
}))

vi.mock('./eventsApi', async (importOriginal) => {
  const real = await importOriginal<typeof EventsApiType>()
  return { ...real, fetchJuntaEvents: () => events() }
})

vi.mock('./paymentsApi', async (importOriginal) => {
  const real = await importOriginal<typeof PaymentsApiType>()
  return {
    ...real,
    fetchAttendees: () => attendees(),
    fetchRequests: () => Promise.resolve([]),
    fetchQueue: () => Promise.resolve([]),
  }
})

const { PaymentsScreen } = await import('./PaymentsScreen')

function munta(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PaymentsScreen />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  params = {}
  events = () => Promise.resolve([...LLISTA])
  attendees = () => Promise.resolve([])
})

describe('la capçalera de pagaments', () => {
  it('no canta un zero que encara no ha comptat', async () => {
    // Mai no torna: la consulta d'apuntats es queda en vol, que és el cas del
    // metro i el de la festa amb dos-cents mòbils a la mateixa antena.
    attendees = () => new Promise<AttendeeRow[]>(() => undefined)
    munta()

    // El títol sí que hi és: el decideix el preu, que ja ha arribat amb
    // l'esdeveniment, i per això la prova no passa només perquè no hi hagi res.
    await screen.findByText('junta.payments.whoComes')

    expect(screen.queryByText('junta.payments.saidYes')).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
    // I es veu que està carregant, que és l'altra meitat: amagar el número
    // sense dir que allò arribarà seria una pantalla mig buida sense motiu.
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  it('ni tampoc quan la consulta ha petat', async () => {
    attendees = () => Promise.reject(new Error('sense xarxa'))
    munta()

    await screen.findByText('junta.payments.whoComes')
    await screen.findByRole('alert')

    expect(screen.queryByText('junta.payments.saidYes')).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
    // Amb error no hi va silueta: una silueta promet que allò arribarà.
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('i el diu quan ja el té', async () => {
    attendees = () =>
      Promise.resolve([
        { id: 'a1', user_id: 'u1', pagado: false, estado: 'si', profiles: null },
        { id: 'a2', user_id: 'u2', pagado: false, estado: 'si', profiles: null },
      ])
    munta()

    // Si no fos per aquesta, les dues de sobre passarien amb la capçalera
    // esborrada del tot.
    expect(await screen.findByText('junta.payments.saidYes')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})

describe('un esdeveniment que ja no surt a la llista de la junta', () => {
  it('no és un calendari buit', async () => {
    params = { eventId: FORA }
    munta()

    expect(await screen.findByText('junta.payments.notInList')).toBeInTheDocument()
    expect(screen.queryByText('junta.noEvents')).toBeNull()
  })

  it('i un calendari buit ho continua sent', async () => {
    events = () => Promise.resolve([])
    munta()

    expect(await screen.findByText('junta.noEvents')).toBeInTheDocument()
    expect(screen.queryByText('junta.payments.notInList')).toBeNull()
  })

  it('i el selector de dalt no ensenya el primer esdeveniment com si l’haguessin triat', async () => {
    params = { eventId: FORA }
    munta()

    await screen.findByText('junta.payments.notInList')

    // Hi ha dos selectors, el del capçal de mòbil i el de la fila de portàtil,
    // i els dos han de dir el mateix: el que es prova és el component, i l'un
    // amagat per CSS no el fa menys llegible per a qui el troba.
    const selectors = await screen.findAllByRole('combobox')
    expect(selectors.length).toBeGreaterThan(0)

    for (const node of selectors) {
      const select = node as HTMLSelectElement
      // Sense opció buida, el navegador tria la primera tot sol i el `value`
      // del `select` passa a ser l'id de la Festa Alfa.
      expect(select.value).toBe('')
      const triat = select.selectedOptions[0]
      expect(triat?.textContent).toContain('junta.payments.pickPrompt')
      expect(triat?.textContent).not.toContain('Festa Alfa')
    }
  })

  it('i amb un esdeveniment de debò el selector sí que el porta triat', async () => {
    params = { eventId: EVENT_B }
    munta()

    // La germana de sobre: sense aquesta, un selector que no triés mai res
    // passaria igual.
    await waitFor(() => {
      const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement
      expect(select.value).toBe(EVENT_B)
    })
    const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    expect(select.selectedOptions[0]?.textContent).toContain('Sopar Bravo')
    expect(screen.queryByText('junta.payments.pickPrompt')).toBeNull()
  })
})
