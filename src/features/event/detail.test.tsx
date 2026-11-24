import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Cover, Places } from './detail'

/**
 * Mentre una estada dura, la fitxa no pot dir que ja ha passat.
 *
 * El xip de la portada i el recompte de sota eren els dos llocs on la casa
 * rural de divendres a diumenge es donava per acabada divendres a la tarda,
 * amb tothom encara dins. Es comprova el text que surt, no les classes.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('la portada', () => {
  it('en curs diu que és ara i no que ja ha passat', () => {
    render(<Cover coverUrl={null} phase="live" corner={null} />)
    expect(screen.getByText('event.live')).toBeInTheDocument()
    expect(screen.queryByText('event.past')).not.toBeInTheDocument()
  })

  it('acabada diu que ja ha passat', () => {
    render(<Cover coverUrl={null} phase="over" corner={null} />)
    expect(screen.getByText('event.past')).toBeInTheDocument()
    expect(screen.queryByText('event.live')).not.toBeInTheDocument()
  })

  it('abans de començar no porta cap xip', () => {
    render(<Cover coverUrl={null} phase="upcoming" corner={null} />)
    expect(screen.queryByText('event.past')).not.toBeInTheDocument()
    expect(screen.queryByText('event.live')).not.toBeInTheDocument()
  })
})

describe('el recompte', () => {
  const base = { total: 20, puntos: 30, left: 4, going: 16, waiting: 0 } as const

  it('en curs compta qui hi és en present, sense places per agafar', () => {
    render(<Places {...base} phase="live" />)
    expect(screen.getByText('event.areThere')).toBeInTheDocument()
    expect(screen.queryByText('event.wereThere')).not.toBeInTheDocument()
    expect(screen.queryByText('home.places.left')).not.toBeInTheDocument()
  })

  it('acabada, en passat', () => {
    render(<Places {...base} phase="over" />)
    expect(screen.getByText('event.wereThere')).toBeInTheDocument()
  })

  it('abans de començar, les places que queden', () => {
    render(<Places {...base} phase="upcoming" />)
    expect(screen.getByText('home.places.left')).toBeInTheDocument()
  })
})
