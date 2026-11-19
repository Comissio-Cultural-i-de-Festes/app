import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { GalleryScreen } from './GalleryScreen'

/**
 * Les miniatures són botons i el que un lector de pantalla en llegeix és la
 * seva etiqueta: la imatge de dins és decorativa (`alt=""`), o sigui que sense
 * etiqueta pròpia cada rajola s'anunciaria com a «botó» i prou.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: Record<string, unknown>) =>
      key === 'gallery.thumbLabel' ? `Foto ${String(o?.n)} de ${String(o?.total)}` : key,
    i18n: { resolvedLanguage: 'ca' },
  }),
}))

const foto = (id: string) => ({
  id,
  path: `${id}.jpg`,
  thumb_path: `${id}-t.jpg`,
  created_at: '2026-01-01T00:00:00Z',
  user_id: 'u1',
  nom: 'Persona',
  meva: false,
  denunciada: false,
})

vi.mock('./api', () => ({
  galleryKeys: { all: () => ['gallery'], photos: (id: string) => ['gallery', id] },
  fetchPhotos: () => Promise.resolve([foto('a'), foto('b'), foto('c')]),
  uploadPhoto: vi.fn(),
}))
vi.mock('@/features/event/api', () => ({
  eventKeys: { one: (id: string) => ['event', id] },
  fetchEvent: () => Promise.resolve({ titulo: 'Nit' }),
}))
vi.mock('@/features/home/api', () => ({
  homeKeys: { summaries: (ids: string[], desde: string) => ['resum', ...ids, desde] },
  fetchSummaries: () => Promise.resolve([]),
}))
vi.mock('@/features/session/useMyProfile', () => ({
  isJunta: () => false,
  useMyProfile: () => ({ data: null }),
}))
vi.mock('@/features/session/useUserId', () => ({ useUserId: () => 'u1' }))
vi.mock('@/lib/useSignedUrls', () => ({ useSignedUrls: () => ({ data: new Map() }) }))
vi.mock('@/features/junta/JuntaHeader', () => ({ JuntaHeader: () => null }))
vi.mock('./Viewer', () => ({ Viewer: () => null }))

describe('GalleryScreen', () => {
  it('cada miniatura és un botó amb nom: el número i el total', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/esdeveniment/e1/fotos']}>
          <Routes>
            <Route path="/esdeveniment/:id/fotos" element={<GalleryScreen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('button', { name: 'Foto 1 de 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Foto 3 de 3' })).toBeInTheDocument()
  })
})
