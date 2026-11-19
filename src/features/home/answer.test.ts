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
    expect(homeCta(null, false, 'known')).toBe('join')
    expect(homeCta('potser', false, 'known')).toBe('join')
    expect(homeCta('no', false, 'known')).toBe('join')
    expect(homeCta('rebutjat', false, 'known')).toBe('join')
  })
  it('qui hi va veu l’enllaç a la fitxa', () => {
    expect(homeCta('si', false, 'known')).toBe('going')
    expect(homeCta('asistio', false, 'known')).toBe('going')
  })
  it('la llista d’espera i el sol·licitat no conviden a tornar-ho a demanar', () => {
    expect(homeCta('espera', false, 'known')).toBe('queued')
    expect(homeCta('sollicitat', false, 'known')).toBe('requested')
  })
  it('amb la finestra oberta, qui hi va o ho dubta fitxa', () => {
    expect(homeCta('si', true, 'known')).toBe('checkin')
    expect(homeCta('potser', true, 'known')).toBe('checkin')
    expect(homeCta('espera', true, 'known')).toBe('queued')
  })
  it('mentre no han arribat les assistències no es diu res de la meva resposta', () => {
    expect(homeCta(null, false, 'waiting')).toBe('waiting')
    expect(homeCta('si', true, 'waiting')).toBe('waiting')
    expect(homeCta('espera', false, 'waiting')).toBe('waiting')
  })
  it('si les assistències no arriben, no se sap res i no es convida a apuntar-s’hi', () => {
    expect(homeCta(null, false, 'unavailable')).toBe('unknown')
    expect(homeCta('espera', true, 'unavailable')).toBe('unknown')
  })
})
