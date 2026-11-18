import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EntryScreen } from './EntryScreen'

/**
 * El codi viatja a Google sigui quin sigui l'estat de la comprovació.
 *
 * `invite_preview` només decideix la cara de la porta. Qui decideix si el codi
 * val és `redeem_invite`, en tornar, i un codi dolent allà no fa cap mal: torna
 * `ok: false` i prou. En canvi, deixar-lo fora del `redirectTo` perquè la
 * comprovació encara no havia contestat —o no havia arribat— és tornar de
 * Google com a pendent amb l'enllaç bo a la mà. Amb la porta davant de la
 * instal·lació a l'iPhone, el primer toc arriba just quan la comprovació
 * encara és pel camí, amb la wifi d'una casa rural.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'ca', exists: () => false },
  }),
}))

// Importa `@/App` per les dues rutes, i amb ell totes les pantalles.
vi.mock('@/features/legal/LegalLinks', () => ({ LegalLinks: () => null }))

const preview = vi.fn<() => Promise<{ data: unknown; error: unknown }>>()

vi.mock('@/lib/supabase', () => ({
  rpc: () => preview(),
  supabase: { auth: { signInWithOtp: vi.fn() } },
}))

const signIn = vi.fn<(code: string | null) => Promise<{ error: string | null }>>()

vi.mock('./useGoogleSignIn', () => ({
  looksStranded: () => false,
  signInWithGoogle: (code: string | null) => signIn(code),
}))

let standalone = false
vi.mock('@/lib/platform', () => ({
  inAppBrowser: () => null,
  isStandalone: () => standalone,
}))

const CODE = 'ABC-123'

beforeEach(() => {
  standalone = false
  signIn.mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/')
})

describe('the door, with a code in the link', () => {
  it('sends the code to Google while the check is still on its way', async () => {
    window.history.replaceState({}, '', `/?codi=${CODE}`)
    // Una comprovació que no contesta mai: el toc arriba abans.
    preview.mockReturnValue(new Promise(() => undefined))
    render(<EntryScreen />)

    fireEvent.click(screen.getByRole('button', { name: /entry\.invited\.cta/ }))

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith(CODE)
    })
  })

  it('sends it too when the check could not reach the server, and does not call it stale', async () => {
    window.history.replaceState({}, '', `/?codi=${CODE}`)
    preview.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    render(<EntryScreen />)

    await waitFor(() => {
      expect(preview).toHaveBeenCalled()
    })
    // Un tall de xarxa no és un codi caducat, i dir-ho faria que algú
    // demanés un enllaç nou que no li cal.
    expect(screen.queryByText('entry.invite.stale')).not.toBeInTheDocument()
    expect(screen.getByText(CODE)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /entry\.invited\.cta/ }))
    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith(CODE)
    })
  })

  it('still says so when the server answers that the code is not valid', async () => {
    window.history.replaceState({}, '', `/?codi=${CODE}`)
    preview.mockResolvedValue({ data: { valid: false }, error: null })
    render(<EntryScreen />)

    expect(await screen.findByText('entry.invite.stale')).toBeInTheDocument()
    // I el codi segueix viatjant: si la junta el reactiva, o el preview s'ha
    // equivocat, el bescanvi és qui té l'última paraula.
    fireEvent.click(screen.getByRole('button', { name: /entry\.open\.cta/ }))
    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith(CODE)
    })
  })
})

describe('the door, from the icon and without a code', () => {
  it('does not tell somebody who is already in that the junta has to let them in', () => {
    standalone = true
    render(<EntryScreen />)

    expect(screen.getByText('entry.app.title')).toBeInTheDocument()
    expect(screen.queryByText('entry.open.title')).not.toBeInTheDocument()
    expect(screen.queryByText('entry.open.lede')).not.toBeInTheDocument()
    expect(screen.getByText('entry.app.hasCodeHint')).toBeInTheDocument()
  })

  it('keeps the request-access door in a browser tab', () => {
    render(<EntryScreen />)
    expect(screen.getByText('entry.open.title')).toBeInTheDocument()
  })
})
