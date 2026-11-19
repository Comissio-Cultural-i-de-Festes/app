import { describe, expect, it } from 'vitest'

import type { AttendanceRow } from './api'
import { expectedState, homeCta, withMyAnswer } from './answer'

const NOW = new Date('2026-09-20T10:00:00Z')

function row(over: Partial<AttendanceRow>): AttendanceRow {
  return {
    user_id: 'u1',
    event_id: 'e1',
    estado: 'si',
    created_at: '2026-09-19T10:00:00Z',
    profiles: { nombre: 'Alfa', avatar_url: null },
    ...over,
  }
}

describe('expectedState', () => {
  it('un «sí» normal és un «sí»', () => {
    expect(expectedState('si')).toBe('si')
  })
  it('amb l’esdeveniment ple s’espera la llista d’espera', () => {
    expect(expectedState('si', { full: true })).toBe('espera')
  })
  it('si cal confirmació s’espera «sol·licitat»', () => {
    expect(expectedState('si', { confirm: true, full: true })).toBe('sollicitat')
  })
  it('un «potser» o un «no» no depèn de les places', () => {
    expect(expectedState('potser', { full: true })).toBe('potser')
    expect(expectedState('no', { confirm: true })).toBe('no')
  })
})

describe('withMyAnswer', () => {
  it('canvia la meva fila i conserva el nom', () => {
    const out = withMyAnswer([row({ estado: 'potser' })], 'e1', 'u1', 'si', NOW)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ estado: 'si', profiles: { nombre: 'Alfa' } })
  })
  it('afegeix la fila quan encara no n’hi havia, sense tocar les dels altres', () => {
    const other = row({ user_id: 'u2' })
    const out = withMyAnswer([other], 'e1', 'u1', 'si', NOW)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ user_id: 'u1', estado: 'si', profiles: null })
    expect(out[1]).toBe(other)
  })
  it('no confon la meva fila d’un altre esdeveniment', () => {
    const elsewhere = row({ event_id: 'e2', estado: 'no' })
    const out = withMyAnswer([elsewhere], 'e1', 'u1', 'si', NOW)
    expect(out).toHaveLength(2)
    expect(out[1]).toBe(elsewhere)
  })
})

describe('homeCta', () => {
  it('qui no ha contestat, o ha dit potser, veu el botó', () => {
    expect(homeCta(null, false, true)).toBe('join')
    expect(homeCta('potser', false, true)).toBe('join')
    expect(homeCta('no', false, true)).toBe('join')
    expect(homeCta('rebutjat', false, true)).toBe('join')
  })
  it('qui hi va veu l’enllaç a la fitxa', () => {
    expect(homeCta('si', false, true)).toBe('going')
    expect(homeCta('asistio', false, true)).toBe('going')
  })
  it('la llista d’espera i el sol·licitat no conviden a tornar-ho a demanar', () => {
    expect(homeCta('espera', false, true)).toBe('queued')
    expect(homeCta('sollicitat', false, true)).toBe('requested')
  })
  it('amb la finestra oberta, qui hi va o ho dubta fitxa', () => {
    expect(homeCta('si', true, true)).toBe('checkin')
    expect(homeCta('potser', true, true)).toBe('checkin')
    expect(homeCta('espera', true, true)).toBe('queued')
  })
  it('mentre no han arribat les assistències no es diu res de la meva resposta', () => {
    expect(homeCta(null, false, false)).toBe('waiting')
    expect(homeCta('si', true, false)).toBe('waiting')
    expect(homeCta('espera', false, false)).toBe('waiting')
  })
})
