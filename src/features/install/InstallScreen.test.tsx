import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InstallScreen } from './InstallScreen'
import { SNOOZE_DONE_MS, SNOOZE_LATER_MS } from './installGate'

/**
 * «Ja ho tinc fet» a l'iPhone.
 *
 * La porta d'aquest Safari és la del magatzem que la icona no veu, o sigui que
 * el botó no hi pot portar: diu on s'ha d'anar. I se'n recorda en el moment de
 * dir-ho, no quan algú prem el «seguir al navegador» —la majoria tancarà la
 * pestanya i obrirà la icona, que és el que se li ha demanat.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'ca', exists: () => false },
  }),
}))

vi.mock('@/lib/platform', () => ({
  inAppBrowser: () => null,
  isIos: () => true,
  isStandalone: () => false,
}))

const DAY = 24 * 60 * 60 * 1000

function snoozedUntil(): number {
  return Number(localStorage.getItem('comi.install.snoozedUntil') ?? 0)
}

beforeEach(() => {
  localStorage.clear()
})

describe('"already done" on the iPhone install screen', () => {
  it('sends them to the icon instead of to the door in Safari', () => {
    const onDone = vi.fn()
    render(<InstallScreen onDone={onDone} onLater={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'install.done' }))

    expect(screen.getByText('install.opened.title')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('remembers the answer as soon as it is given', () => {
    render(<InstallScreen onDone={vi.fn()} onLater={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'install.done' }))

    expect(snoozedUntil()).toBeGreaterThan(Date.now() + SNOOZE_LATER_MS + DAY)
    expect(snoozedUntil()).toBeLessThanOrEqual(Date.now() + SNOOZE_DONE_MS)
  })

  it('still lets them stay in the browser', () => {
    const onDone = vi.fn()
    render(<InstallScreen onDone={onDone} onLater={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'install.done' }))
    fireEvent.click(screen.getByRole('button', { name: 'install.opened.stay' }))

    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
