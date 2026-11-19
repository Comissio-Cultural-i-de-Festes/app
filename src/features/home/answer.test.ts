import { describe, expect, it } from 'vitest'

import { expectedState, homeCta, restoreEvent, withMyAnswer } from './answer'
import { type EventSummary, type Face, emptySummary } from './summary'

const NOW = new Date('2026-09-20T10:00:00Z')
const ME = 'u1'

function face(user_id: string, created_at: string): Face {
  return { user_id, avatar_url: `${user_id}/1.jpg`, created_at }
}

function summary(over: Partial<EventSummary> = {}): EventSummary {
  return { ...emptySummary('e1'), ...over }
}

const one = (out: readonly EventSummary[], id = 'e1') => out.find((s) => s.event_id === id)
const ids = (out: readonly EventSummary[], id = 'e1') => one(out, id)?.faces.map((f) => f.user_id)

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
  it('el meu sí suma un, i la meva cara va al davant amb la foto del perfil', () => {
    const before = summary({ going: 1, faces: [face('u2', '2026-09-19T10:00:00Z')] })
    const out = withMyAnswer([before], 'e1', ME, 'si', NOW, 'u1/9.jpg')
    expect(one(out)).toMatchObject({ going: 2, mine: 'si', mine_at: NOW.toISOString() })
    expect(one(out)?.faces[0]).toEqual({
      user_id: ME,
      avatar_url: 'u1/9.jpg',
      created_at: NOW.toISOString(),
    })
    expect(ids(out)).toEqual([ME, 'u2'])
  })

  it('un potser que passa a sí conserva l’hora: la cara va on la posarà el servidor', () => {
    const before = summary({
      going: 2,
      mine: 'potser',
      mine_at: '2026-09-19T12:00:00Z',
      faces: [face('u2', '2026-09-19T15:00:00Z'), face('u3', '2026-09-19T09:00:00Z')],
    })
    const out = withMyAnswer([before], 'e1', ME, 'si', NOW, null)
    expect(ids(out)).toEqual(['u2', ME, 'u3'])
    expect(one(out)?.mine_at).toBe('2026-09-19T12:00:00Z')
  })

  it('no hi entra si és més vell que les cinc que hi ha', () => {
    const faces = ['a', 'b', 'c', 'd', 'e'].map((u) => face(u, '2026-09-19T15:00:00Z'))
    const before = summary({ going: 8, mine: 'no', mine_at: '2026-09-01T00:00:00Z', faces })
    const out = withMyAnswer([before], 'e1', ME, 'si', NOW, null)
    expect(one(out)?.going).toBe(9)
    expect(ids(out)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('ni darrere de l’última si hi ha gent amagada que no se sap on va', () => {
    const before = summary({
      going: 7,
      mine: 'no',
      mine_at: '2026-09-01T00:00:00Z',
      faces: [face('a', '2026-09-19T15:00:00Z')],
    })
    expect(ids(withMyAnswer([before], 'e1', ME, 'si', NOW, null))).toEqual(['a'])
  })

  it('i en cinc com a molt', () => {
    const faces = ['a', 'b', 'c', 'd', 'e'].map((u) => face(u, '2026-09-19T15:00:00Z'))
    const out = withMyAnswer([summary({ going: 5, faces })], 'e1', ME, 'si', NOW, null)
    expect(ids(out)).toEqual([ME, 'a', 'b', 'c', 'd'])
  })

  it('dir que no treu la cara i resta un', () => {
    const before = summary({
      going: 2,
      mine: 'si',
      mine_at: '2026-09-19T12:00:00Z',
      faces: [face(ME, '2026-09-19T12:00:00Z'), face('u2', '2026-09-19T09:00:00Z')],
    })
    const out = withMyAnswer([before], 'e1', ME, 'no', NOW, null)
    expect(one(out)).toMatchObject({ going: 1, mine: 'no' })
    expect(ids(out)).toEqual(['u2'])
  })

  it('la llista d’espera no compta ni té cara', () => {
    const out = withMyAnswer([summary({ going: 10 })], 'e1', ME, 'espera', NOW, null)
    expect(one(out)).toMatchObject({ going: 10, mine: 'espera', faces: [] })
  })

  it('un sí que ja era sí no es compta dues vegades ni canvia de lloc', () => {
    const before = summary({
      going: 2,
      mine: 'si',
      mine_at: '2026-09-19T12:00:00Z',
      faces: [face('u2', '2026-09-19T15:00:00Z'), face(ME, '2026-09-19T12:00:00Z')],
    })
    const out = withMyAnswer([before], 'e1', ME, 'si', NOW, null)
    expect(one(out)?.going).toBe(2)
    expect(ids(out)).toEqual(['u2', ME])
  })

  it('no toca l’altre esdeveniment, i en crea un si encara no n’hi havia', () => {
    const elsewhere = summary({ event_id: 'e2', going: 4 })
    const out = withMyAnswer([elsewhere], 'e1', ME, 'si', NOW, null)
    expect(one(out, 'e2')).toBe(elsewhere)
    expect(one(out)).toMatchObject({ going: 1, mine: 'si' })
  })

  it('no toca els noms d’avui: el meu no hi és mai', () => {
    const recent = [{ nombre: 'Alfa', created_at: '2026-09-20T09:00:00Z' }]
    const out = withMyAnswer([summary({ recent })], 'e1', ME, 'si', NOW, null)
    expect(one(out)?.recent).toBe(recent)
  })
})

describe('restoreEvent', () => {
  it('torna l’esdeveniment a com era i deixa els altres com estan ara', () => {
    const was = summary({ going: 1 })
    const now = [summary({ going: 2, mine: 'si' }), summary({ event_id: 'e2', mine: 'si' })]
    const out = restoreEvent(now, 'e1', was)
    expect(one(out)).toBe(was)
    expect(one(out, 'e2')?.mine).toBe('si')
  })

  it('sense res d’abans, el treu', () => {
    const out = restoreEvent([summary({ mine: 'si' })], 'e1', undefined)
    expect(out).toEqual([])
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
