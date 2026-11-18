import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { rememberInvite } from '@/features/entry/pendingInvite'

import { InstallCard } from './InstallCard'
import { SNOOZE_DONE_MS, SNOOZE_LATER_MS, shouldOfferInstallCard } from './installGate'

/**
 * La targeta, muntada. `installGate.test.ts` prova quan toca; això prova que la
 * targeta en fa cas, i que les dues respostes la treuen i se'n recorden.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'ca', exists: () => false },
  }),
}))

let standalone = false
let ios = true
vi.mock('@/lib/platform', () => ({
  inAppBrowser: () => null,
  isIos: () => ios,
  isStandalone: () => standalone,
}))

const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  standalone = false
  ios = true
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('the install card on the home screen', () => {
  it('shows on an iPhone in Safari', () => {
    render(<InstallCard />)
    expect(screen.getByText('install.card.title')).toBeInTheDocument()
  })

  it('does not show from the icon', () => {
    standalone = true
    render(<InstallCard />)
    expect(screen.queryByText('install.card.title')).not.toBeInTheDocument()
  })

  it('does not show while the code from the link is still waiting to be redeemed', () => {
    // Instal·lar ara voldria dir obrir la icona sense el codi, i encara com a
    // pendent: el mateix forat que la porta davant de la instal·lació tapa.
    window.history.replaceState({}, '', '/?codi=ABC-123')
    const inUrl = render(<InstallCard />)
    expect(screen.queryByText('install.card.title')).not.toBeInTheDocument()
    inUrl.unmount()

    window.history.replaceState({}, '', '/')
    rememberInvite('ABC-123')
    render(<InstallCard />)
    expect(screen.queryByText('install.card.title')).not.toBeInTheDocument()
  })

  it('goes away on "not now", and stays away for a week', () => {
    render(<InstallCard />)
    fireEvent.click(screen.getByRole('button', { name: 'install.card.later' }))

    expect(screen.queryByText('install.card.title')).not.toBeInTheDocument()
    expect(shouldOfferInstallCard(Date.now() + DAY)).toBe(false)
    expect(shouldOfferInstallCard(Date.now() + SNOOZE_LATER_MS + DAY)).toBe(true)
  })

  it('opens the steps, and "already done" puts it away for a month', () => {
    render(<InstallCard />)
    fireEvent.click(screen.getByRole('button', { name: 'install.card.cta' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('install.step1.title')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'install.done' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('install.card.title')).not.toBeInTheDocument()
    expect(shouldOfferInstallCard(Date.now() + SNOOZE_LATER_MS + DAY)).toBe(false)
    expect(shouldOfferInstallCard(Date.now() + SNOOZE_DONE_MS + DAY)).toBe(true)
  })
})
