import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { describe, expect, it, vi } from 'vitest'

import { signedKey } from '@/lib/signedQuery'

import { InviteCodeSheet } from './InviteCodeSheet'

/**
 * Bescanviar un codi canvia tot el que es pot veure, no només el perfil.
 *
 * Les assistències, el rànquing i els punts de les escoles es van llegir com a
 * pendent i la RLS els va tornar buits; amb una invalidació només del perfil,
 * aquelles llistes buides es queden en cau i la pantalla diu «hi van 0» a qui
 * acaba d'entrar.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'ca' } }),
}))
vi.mock('@/lib/supabase', () => ({
  rpc: () => Promise.resolve({ data: { ok: true }, error: null }),
}))

describe('InviteCodeSheet', () => {
  it('invalida tota la cau quan el codi val', async () => {
    const client = new QueryClient()
    client.setQueryData(['home', 'attendances', ['e1']], [])
    client.setQueryData(['ranking', 'individual'], [])
    render(
      <QueryClientProvider client={client}>
        <InviteCodeSheet onClose={() => undefined} />
      </QueryClientProvider>,
    )

    fireEvent.change(screen.getByLabelText('pending.codeLabel'), { target: { value: 'ABC' } })
    fireEvent.click(screen.getByRole('button', { name: 'pending.codeCta' }))

    await waitFor(() => {
      expect(client.getQueryState(['home', 'attendances', ['e1']])?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(['ranking', 'individual'])?.isInvalidated).toBe(true)
  })

  it('torna a signar les portades que eren null, i només aquestes', async () => {
    const client = new QueryClient()
    client.setQueryData(signedKey('event-covers', 'e/sense.jpg'), null)
    client.setQueryData(signedKey('event-covers', 'e/amb.jpg'), 'https://cdn.test/amb')
    render(
      <QueryClientProvider client={client}>
        <InviteCodeSheet onClose={() => undefined} />
      </QueryClientProvider>,
    )

    fireEvent.change(screen.getByLabelText('pending.codeLabel'), { target: { value: 'ABC' } })
    fireEvent.click(screen.getByRole('button', { name: 'pending.codeCta' }))

    await waitFor(() => {
      expect(client.getQueryState(signedKey('event-covers', 'e/sense.jpg'))?.isInvalidated).toBe(
        true,
      )
    })
    expect(client.getQueryState(signedKey('event-covers', 'e/amb.jpg'))?.isInvalidated).toBe(false)
  })
})
