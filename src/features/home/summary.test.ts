import { describe, expect, it } from 'vitest'

import { type EventSummary, dayStartIso, emptySummary, isGoing, summaryOf } from './summary'

function summary(over: Partial<EventSummary> = {}): EventSummary {
  return { ...emptySummary('e1'), ...over }
}

describe('summaryOf', () => {
  it('troba el de l’esdeveniment', () => {
    const mine = summary({ going: 3 })
    expect(summaryOf([summary({ event_id: 'e2' }), mine], 'e1')).toBe(mine)
  })

  it('sense dades és un de buit, a zero i sense resposta', () => {
    expect(summaryOf([], 'e9')).toEqual({
      event_id: 'e9',
      going: 0,
      attended: 0,
      mine: null,
      mine_at: null,
      faces: [],
      recent_total: 0,
      recent: [],
    })
  })
})

describe('who counts as coming', () => {
  it('counts the yeses and the people already through the door', () => {
    expect(isGoing('si')).toBe(true)
    expect(isGoing('asistio')).toBe(true)
    expect(isGoing('potser')).toBe(false)
    expect(isGoing('espera')).toBe(false)
    expect(isGoing(null)).toBe(false)
  })
})

describe('dayStartIso', () => {
  it('és la mitjanit de Madrid, no la d’UTC', () => {
    expect(dayStartIso(new Date('2026-09-20T11:30:00Z'))).toBe('2026-09-19T22:00:00.000Z')
  })

  it('a les dotze i mitja de la nit ja és el dia nou', () => {
    // 22:30Z ja són les 00:30 del 20 a Madrid: qui s'hi apunta ara és d'avui.
    expect(dayStartIso(new Date('2026-09-19T22:30:00Z'))).toBe('2026-09-19T22:00:00.000Z')
  })

  it('el dia que es retarda l’hora, la mitjanit és encara la d’estiu', () => {
    expect(dayStartIso(new Date('2026-10-25T20:00:00Z'))).toBe('2026-10-24T22:00:00.000Z')
  })

  it('el dia que s’avança l’hora, la mitjanit és encara la d’hivern', () => {
    expect(dayStartIso(new Date('2026-03-29T12:00:00Z'))).toBe('2026-03-28T23:00:00.000Z')
  })

  it('és el mateix tot el dia, que és el que el fa servir de clau', () => {
    expect(dayStartIso(new Date('2026-09-20T08:00:00Z'))).toBe(
      dayStartIso(new Date('2026-09-20T21:59:00Z')),
    )
  })
})
