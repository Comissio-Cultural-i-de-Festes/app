import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CheckinsScreen } from './CheckinsScreen'
import type * as CheckinsApi from './checkinsApi'
import type * as EventApi from '@/features/event/api'

/**
 * Treure un fitxatge no es fa amb un sol toc.
 *
 * «Treu-ho» esborra el fitxatge i els punts, i en una llista de cent files un
 * toc que cau a la fila del costat treu punts a una persona que no hi tenia
 * res a veure; el rastre queda a l'audit_log però ningú li ho torna. Per això
 * el primer toc només obre la confirmació i el servidor no se'n assabenta fins
 * al segon. Les crides es vigilen aquí, no el que es veu: el que costa és que
 * `admin_undo_checkin` surti.
 *
 * Gent i fets inventats.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'ca', language: 'ca', exists: () => false },
  }),
}))

const undoCheckin = vi.fn<(eventId: string, userId: string) => Promise<void>>()

vi.mock('./checkinsApi', async (original) => {
  const real = await original<typeof CheckinsApi>()
  return {
    ...real,
    fetchCheckins: () => Promise.resolve(FILES),
    undoCheckin: (e: string, u: string) => undoCheckin(e, u),
  }
})

vi.mock('@/features/event/api', async (original) => {
  const real = await original<typeof EventApi>()
  return { ...real, fetchEvent: () => Promise.resolve({ titulo: 'Sopar' }) }
})

const EVENT = '00000000-0000-4000-8000-0000000000e1'
const ALFA = '00000000-0000-4000-8000-0000000000a1'
const BRAVO = '00000000-0000-4000-8000-0000000000a2'

const FILES: CheckinsApi.CheckinRow[] = [ALFA, BRAVO].map((user_id, i) => ({
  user_id,
  nombre: i === 0 ? 'Alfa Bravo' : 'Charlie Delta',
  avatar_url: null,
  checked_in_at: '2026-09-18T20:00:00Z',
  checkin_via: 'ubicacio',
  checkin_dist_m: 4000,
  checkin_precisio_m: 10,
  was_registered: true,
  pagado: null,
}))

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
      <MemoryRouter initialEntries={[`/junta/esdeveniment/${EVENT}/fitxatges`]}>
        <Routes>
          <Route path="/junta/esdeveniment/:id/fitxatges" element={<CheckinsScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CheckinsScreen, treient un fitxatge', () => {
  it('un toc a «Treu-ho» no esborra res: demana confirmació', async () => {
    munta()
    const botons = await screen.findAllByRole('button', { name: 'junta.checkins.undo' })
    fireEvent.click(botons[0]!)

    expect(await screen.findByText('junta.checkins.undoSure')).toBeInTheDocument()
    expect(undoCheckin).not.toHaveBeenCalled()
  })

  it('«Cancel·la» ho deixa tal com era', async () => {
    munta()
    fireEvent.click((await screen.findAllByRole('button', { name: 'junta.checkins.undo' }))[0]!)
    fireEvent.click(await screen.findByRole('button', { name: 'actions.cancel' }))

    expect(screen.queryByText('junta.checkins.undoSure')).toBeNull()
    expect(undoCheckin).not.toHaveBeenCalled()
  })

  it('confirmar-ho treu el fitxatge de qui s’ha tocat, i només aquest', async () => {
    undoCheckin.mockResolvedValue()
    munta()
    fireEvent.click((await screen.findAllByRole('button', { name: 'junta.checkins.undo' }))[1]!)
    fireEvent.click(await screen.findByRole('button', { name: 'junta.checkins.undoConfirm' }))

    await waitFor(() => {
      expect(undoCheckin).toHaveBeenCalledTimes(1)
    })
    expect(undoCheckin).toHaveBeenCalledWith(EVENT, BRAVO)
  })
})
