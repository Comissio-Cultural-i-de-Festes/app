import { describe, expect, it } from 'vitest'

import type { PersonRow } from '@/features/gimcana/api'

import { countByTeam, fold, tapTarget, visiblePeople, withTeam } from './teamsBoard'

/**
 * Repartir equips: què passa en tocar una fila, i què es veu.
 *
 * Persones inventades.
 */

function person(user_id: string, nombre: string, equip_id: string | null): PersonRow {
  return { user_id, nombre, avatar_url: null, equip_id, ha_arribat: true, fotos: 0 }
}

const GENT: readonly PersonRow[] = [
  person('a', 'Aina Roig', 'blau'),
  person('b', 'Bernat Puig', 'verd'),
  person('c', 'Martí Soler', null),
  person('d', 'Dúnia Vidal', null),
]

describe('tapTarget', () => {
  it('posa a l’equip actiu qui no en té', () => {
    expect(tapTarget(person('c', 'Martí', null), 'blau')).toBe('blau')
  })

  it('mou a l’equip actiu qui és en un altre', () => {
    expect(tapTarget(person('b', 'Bernat', 'verd'), 'blau')).toBe('blau')
  })

  it('treu de l’equip qui ja és a l’actiu, com una casella que es desmarca', () => {
    expect(tapTarget(person('a', 'Aina', 'blau'), 'blau')).toBeNull()
  })
})

describe('withTeam', () => {
  it('canvia una persona i deixa les altres com eren', () => {
    const next = withTeam(GENT, 'c', 'verd')
    expect(next.find((p) => p.user_id === 'c')?.equip_id).toBe('verd')
    expect(next.filter((p) => p.user_id !== 'c')).toEqual(GENT.filter((p) => p.user_id !== 'c'))
  })

  it('no canvia l’ordre: res no salta sota el dit', () => {
    expect(withTeam(GENT, 'a', null).map((p) => p.user_id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('countByTeam', () => {
  it('compta cada equip i els que no en tenen', () => {
    const counts = countByTeam(GENT)
    expect(counts.get('blau')).toBe(1)
    expect(counts.get('verd')).toBe(1)
    expect(counts.get(null)).toBe(2)
    expect(counts.get('groc')).toBeUndefined()
  })
})

describe('visiblePeople', () => {
  it('sense cerca ni filtre, tothom', () => {
    expect(visiblePeople(GENT, '', false)).toHaveLength(4)
  })

  it('el filtre deixa només qui no té equip', () => {
    expect(visiblePeople(GENT, '', true).map((p) => p.user_id)).toEqual(['c', 'd'])
  })

  it('la cerca no mira majúscules ni accents', () => {
    expect(visiblePeople(GENT, 'marti', false).map((p) => p.user_id)).toEqual(['c'])
    expect(visiblePeople(GENT, 'DUNIA', false).map((p) => p.user_id)).toEqual(['d'])
  })

  it('i busca dins del nom, no només al principi', () => {
    expect(visiblePeople(GENT, 'puig', false).map((p) => p.user_id)).toEqual(['b'])
  })

  it('els blancs del voltant no compten', () => {
    expect(visiblePeople(GENT, '  aina ', false).map((p) => p.user_id)).toEqual(['a'])
  })
})

describe('fold', () => {
  it('treu accents i majúscules', () => {
    expect(fold('Àlex Ñúñez Çelà')).toBe('alex nunez cela')
  })
})
