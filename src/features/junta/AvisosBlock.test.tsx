import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AvisosBlock } from './AvisosBlock'
import type * as AvisosApi from './avisosApi'

/**
 * Retirar un avís sense cobertura ha de dir alguna cosa.
 *
 * EL QUE PASSA SENSE LA LÍNIA. React Query atura una mutació quan
 * `navigator.onLine` és fals: no crida `mutationFn`, no falla, no fa res, i
 * `isPending` es queda a cert per sempre. `Confirm` desactiva els dos botons
 * amb `busy`, o sigui que qui prem «Retira l'avís» sota terra es queda amb el
 * panell obert, els dos botons morts i cap frase enlloc. No es perd res —quan
 * torni la xarxa surt sola— però l'únic remei que se li acut a ningú davant
 * d'un botó que no contesta és tornar-hi, i tornar-hi aquí vol dir retirar dues
 * vegades. `AvisForm`, just a sota en la mateixa pantalla, ja ho deia; aquest
 * bloc no.
 *
 * PER QUÈ LA COBERTURA ES TALLA DESPRÉS DE CARREGAR. Les consultes també
 * s'aturen sense xarxa, i amb el navegador fora de línia des del principi el
 * bloc no passaria mai de la silueta i no hi hauria cap botó per prémer. Talla
 * la xarxa qui la talla de debò: algú que ja tenia la fitxa oberta i entra a un
 * soterrani.
 *
 * Gent i fets inventats, com a tot el repo.
 */

vi.mock('react-i18next', () => ({
  // La clau i prou: aquest fitxer prova quina frase surt, no com està escrita.
  // La parla la vigilen `i18n-parity` i `i18n-usage`.
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'ca', exists: () => false },
  }),
}))

// Qui mira la fitxa és algú de la junta que no és la persona: si fos la mateixa,
// no hi hauria cap botó per prémer (migració 93).
const JUNTA = '00000000-0000-4000-8000-0000000000c1'
const PROPOSA = '00000000-0000-4000-8000-0000000000c2'
let jo = JUNTA

vi.mock('@/features/session/useUserId', () => ({
  useUserId: () => jo,
}))

vi.mock('./useNormativa', () => ({
  useNormativa: () => ({
    pesos: { 1: 1, 2: 2, 3: 4 },
    llindars: { avis: 2, risc: 4, expulsio: 6 },
    des_de: '2026-09-01T00:00:00Z',
    fins_a: null,
    llest: true,
  }),
}))

const retiraAvis = vi.fn<(id: string, nota: string) => Promise<void>>()
const validaAvis = vi.fn<(id: string) => Promise<void>>()
const rebutjaAvis = vi.fn<(id: string, nota: string) => Promise<void>>()

vi.mock('./avisosApi', async (original) => {
  const real = await original<typeof AvisosApi>()
  return {
    ...real,
    fetchAvisos: () => Promise.resolve(files),
    fetchAvisTipus: () => Promise.resolve([]),
    retiraAvis: (id: string, nota: string) => retiraAvis(id, nota),
    validaAvis: (id: string) => validaAvis(id),
    rebutjaAvis: (id: string, nota: string) => rebutjaAvis(id, nota),
  }
})

const SOCI = '00000000-0000-4000-8000-0000000000a1'

const FILES: AvisosApi.AvisRow[] = [
  {
    id: '00000000-0000-4000-8000-0000000000b1',
    user_id: SOCI,
    tipus: 'greu',
    gravetat: 3,
    nota: 'No va venir al muntatge que havia dit que faria',
    event_id: null,
    created_by: PROPOSA,
    created_at: '2026-09-18T20:00:00Z',
    validat_at: '2026-09-19T09:00:00Z',
    punts: -25,
    retirat_at: null,
    retirat_nota: null,
    mesura_presa: null,
    points_log: { puntos: -25 },
  },
]

let files = FILES

const PROPOSAT: AvisosApi.AvisRow = {
  ...FILES[0]!,
  id: '00000000-0000-4000-8000-0000000000b2',
  nota: 'Va marxar amb les claus del local',
  validat_at: null,
  points_log: null,
}

afterEach(() => {
  onlineManager.setOnline(true)
  vi.clearAllMocks()
  jo = JUNTA
  files = FILES
})

function munta() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <AvisosBlock userId={SOCI} nombre="Alfa Bravo" />
    </QueryClientProvider>,
  )
}

describe('AvisosBlock, retirant un avís', () => {
  it('diu que la retirada espera quan la xarxa se’n va', async () => {
    munta()

    // Primer amb cobertura, que si no la consulta tampoc no arriba.
    fireEvent.click(await screen.findByRole('button', { name: 'junta.soci.avisos.withdraw' }))

    onlineManager.setOnline(false)

    fireEvent.change(screen.getByLabelText('junta.soci.avisos.withdrawNote'), {
      target: { value: 'Havia avisat, error nostre' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'junta.soci.avisos.withdraw' }))

    const pausa = await screen.findByText('junta.soci.avisos.withdrawPaused')
    expect(pausa).toHaveAttribute('role', 'status')
    // I la crida no ha sortit: és una pausa, no una fallada silenciosa.
    expect(retiraAvis).not.toHaveBeenCalled()
  })

  it('i no la diu quan hi ha cobertura', async () => {
    retiraAvis.mockResolvedValue()
    munta()

    fireEvent.click(await screen.findByRole('button', { name: 'junta.soci.avisos.withdraw' }))
    fireEvent.change(screen.getByLabelText('junta.soci.avisos.withdrawNote'), {
      target: { value: 'Havia avisat, error nostre' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'junta.soci.avisos.withdraw' }))

    await waitFor(() => {
      expect(retiraAvis).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByText('junta.soci.avisos.withdrawPaused')).toBeNull()
  })
})

describe('AvisosBlock, un avís proposat (migració 93)', () => {
  it('a una altra persona de la junta li ofereix validar-lo, i valida aquell', async () => {
    validaAvis.mockResolvedValue()
    files = [PROPOSAT]
    munta()

    expect(await screen.findByText('junta.soci.avisos.proposat')).toBeInTheDocument()
    // Un proposat no es retira: es valida o es rebutja.
    expect(screen.queryByRole('button', { name: 'junta.soci.avisos.withdraw' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'junta.soci.avisos.valida' }))
    fireEvent.click(screen.getByRole('button', { name: 'junta.soci.avisos.validaCta' }))

    await waitFor(() => {
      expect(validaAvis).toHaveBeenCalledWith(PROPOSAT.id)
    })
  })

  it('a qui l’ha proposat no li ofereix validar-lo, però sí rebutjar-lo', async () => {
    jo = PROPOSA
    files = [PROPOSAT]
    munta()

    expect(await screen.findByText('junta.soci.avisos.proposatPerMi')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'junta.soci.avisos.valida' })).toBeNull()
    expect(screen.getByRole('button', { name: 'junta.soci.avisos.rebutja' })).toBeInTheDocument()
  })

  it('rebutjar crida la seva RPC i no la de retirar', async () => {
    // Si algú altre l'ha validat mentrestant, la de rebutjar ho diu; la de
    // retirar el retiraria i notificaria la persona.
    rebutjaAvis.mockResolvedValue()
    jo = PROPOSA
    files = [PROPOSAT]
    munta()

    fireEvent.click(await screen.findByRole('button', { name: 'junta.soci.avisos.rebutja' }))
    fireEvent.change(screen.getByLabelText('junta.soci.avisos.rebutjaNote'), {
      target: { value: 'No va anar així' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'junta.soci.avisos.rebutja' }).at(-1)!)

    await waitFor(() => {
      expect(rebutjaAvis).toHaveBeenCalledWith(PROPOSAT.id, 'No va anar així')
    })
    expect(retiraAvis).not.toHaveBeenCalled()
  })

  it('a la seva pròpia fitxa, ni botons ni formulari', async () => {
    // Els proposats contra ell no hi arriben —la política els hi amaga—; el
    // validat sí, i sense cap botó.
    jo = SOCI
    munta()

    expect(await screen.findByText(FILES[0]!.nota)).toBeInTheDocument()
    expect(screen.getByText('junta.soci.avisos.propi')).toBeInTheDocument()
    for (const nom of [
      'junta.soci.avisos.valida',
      'junta.soci.avisos.rebutja',
      'junta.soci.avisos.withdraw',
      'junta.soci.avisos.mesuraAdd',
      'junta.soci.avis.save',
    ]) {
      expect(screen.queryByRole('button', { name: nom }), nom).toBeNull()
    }
  })
})
