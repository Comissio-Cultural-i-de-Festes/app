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

vi.mock('@/features/ranking/useRanking', () => ({
  useCurs: () => ({ des_de: '2026-09-01T00:00:00Z', fins_a: null, llest: true }),
}))

const retiraAvis = vi.fn<(id: string, nota: string) => Promise<void>>()

vi.mock('./avisosApi', async (original) => {
  const real = await original<typeof AvisosApi>()
  return {
    ...real,
    fetchAvisos: () => Promise.resolve(FILES),
    fetchAvisTipus: () => Promise.resolve([]),
    retiraAvis: (id: string, nota: string) => retiraAvis(id, nota),
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
    created_at: '2026-09-18T20:00:00Z',
    retirat_at: null,
    retirat_nota: null,
    points_log: { puntos: -25 },
  },
]

afterEach(() => {
  onlineManager.setOnline(true)
  vi.clearAllMocks()
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
