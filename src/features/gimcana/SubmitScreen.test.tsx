import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UnreadableImage } from '@/lib/storage'

import type * as ApiType from './api'
import type { Gimcana } from './api'

/**
 * El selector de fitxer de la prova.
 *
 * Sense `capture`, iOS i Android ofereixen «Fer foto» i «Fototeca»; amb ell
 * obrien directament la càmera, i qui havia fet les fotos abans de tenir
 * cobertura no podia triar-les. I una foto del carret que el navegador no sap
 * llegir (un HEIC fora de Safari) ha de dir-ho, no passar per «a la cua».
 */

const OBERTA: Gimcana = {
  estat: 'oberta',
  id: 'g1',
  mena_equips: 'lliure',
  topall_equip: null,
  equip: { id: 'e1', nom: 'Alfa', escola: null },
  a_la_cua: 0,
  proves: [
    {
      id: 'p1',
      ordre: 1,
      titol: 'Prova inventada',
      descripcio: null,
      punts: 10,
      estat: null,
      motiu: null,
      qui: null,
    },
  ],
}

let submit: () => Promise<string> = () => Promise.resolve('enviada')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'ca' } }),
}))

vi.mock('react-router', () => ({
  useParams: () => ({ id: 'ev1', provaId: 'p1' }),
  useNavigate: () => () => Promise.resolve(),
  useLocation: () => ({ pathname: '/', search: '' }),
  Link: ({ children }: { readonly children: ReactNode }) => <a href="#">{children}</a>,
}))

vi.mock('@/features/junta/JuntaHeader', () => ({ JuntaHeader: () => null }))

vi.mock('./api', async (importOriginal) => {
  const real = await importOriginal<typeof ApiType>()
  return {
    ...real,
    fetchGimcana: () => Promise.resolve(OBERTA),
    submitProva: () => submit(),
  }
})

const { SubmitScreen } = await import('./SubmitScreen')

async function munta(): Promise<HTMLInputElement> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { container } = render(
    <QueryClientProvider client={client}>
      <SubmitScreen />
    </QueryClientProvider>,
  )
  await screen.findByText('Prova inventada')
  return container.querySelector<HTMLInputElement>('input[type="file"]')!
}

beforeEach(() => {
  submit = () => Promise.resolve('enviada')
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }),
  )
})

describe('el selector de la prova', () => {
  it('accepta imatges i no obliga la càmera', async () => {
    const input = await munta()

    expect(input.getAttribute('accept')).toBe('image/*')
    expect(input.hasAttribute('capture')).toBe(false)
  })

  it('una foto que el navegador no sap llegir ho diu, no es queda a la cua', async () => {
    submit = () => Promise.reject(new UnreadableImage(new Error('no decoder')))
    const input = await munta()

    fireEvent.change(input, {
      target: { files: [new File(['x'], 'IMG_1.heic', { type: 'image/heic' })] },
    })
    fireEvent.click(screen.getByText('gimcana.send'))

    const alert = await screen.findByRole('alert')
    await waitFor(() => {
      expect(alert.textContent).toBe('errors.notAnImage')
    })
    expect(screen.queryByText('gimcana.queued')).toBeNull()
  })
})
