import { QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/lib/queryClient'

import type * as Api from './api'
import type { GalleryPhoto } from './api'
import { Viewer } from './Viewer'

/**
 * Lliscar no ensenya «Carregant» a cada foto.
 *
 * El visor signa la que es mira i les dues del costat en la mateixa petició,
 * de manera que quan el dit canvia de foto la URL ja hi és.
 */

const sign = vi.fn<(paths: string[]) => Promise<unknown>>()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: { n?: number }) => (o?.n === undefined ? key : `${key} ${String(o.n)}`),
    i18n: { resolvedLanguage: 'ca' },
  }),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({ createSignedUrls: (paths: string[]) => sign(paths) }),
    },
  },
}))
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  deletePhoto: () => Promise.resolve(),
}))

const photo = (n: number): GalleryPhoto => ({
  id: `id${String(n)}`,
  path: `e/${String(n)}.jpg`,
  thumb_path: `e/${String(n)}.thumb.jpg`,
  created_at: '2026-11-28T22:00:00Z',
  user_id: 'u',
  nom: 'Ana',
  meva: false,
  denunciada: false,
})

afterEach(() => {
  sign.mockReset()
})

describe('Viewer', () => {
  it('signa la foto, l’anterior i la següent d’un cop', async () => {
    sign.mockImplementation((paths) =>
      Promise.resolve({
        data: paths.map((p) => ({ path: p, signedUrl: `https://cdn.test/${p}`, error: null })),
        error: null,
      }),
    )
    const client = createQueryClient()
    const photos = [1, 2, 3, 4, 5].map(photo)

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Viewer photos={photos} index={2} isAdmin={false} onClose={() => undefined} />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(document.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/e/3.jpg')
    })
    expect(sign).toHaveBeenCalledTimes(1)
    expect([...sign.mock.calls[0]![0]].sort()).toEqual(['e/2.jpg', 'e/3.jpg', 'e/4.jpg'])

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'gallery.viewer.next' }))
    })
    expect(document.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/e/4.jpg')
    expect(screen.queryByText('state.loading')).toBeNull()
  })
})
