import { describe, expect, it } from 'vitest'

import { teamName } from './teamName'

/**
 * Com es diu un equip, i sobretot el cas que va fallar de debò: la pantalla de
 * validar de la junta pintava «Equip 1» a totes les fotos perquè li passava una
 * fila on el nom viu a un altre camp. Ara el tipus no ho deixa fer, i aquest
 * fitxer fixa què ha de sortir en cada procedència.
 */

const t = ((clau: string, opcions?: { readonly n?: number }): string =>
  opcions?.n === undefined ? clau : `${clau}:${String(opcions.n)}`) as never

describe('teamName', () => {
  it('en mode escoles guanya l\'escola, encara que hi hagi nom', () => {
    expect(teamName({ nom: 'Els cracks', escola: 'politecnica' }, 0, t)).toBe(
      'escolaShort.politecnica',
    )
  })

  it('sense escola val el nom que hi va posar la junta', () => {
    expect(teamName({ nom: 'Els cracks', escola: null }, 3, t)).toBe('Els cracks')
  })

  // El sorteig crea els equips amb `nom` a NULL: llavors el número és l'únic
  // nom que tenen, i ve de `ordre`, que compta des d'1.
  it('sense escola i sense nom, el número, i compta des d\'1', () => {
    expect(teamName({ nom: null, escola: null }, 0, t)).toBe('gimcana.teamNumber:1')
    expect(teamName({ nom: null, escola: null }, 2, t)).toBe('gimcana.teamNumber:3')
  })

  it('un nom buit compta com a no tenir-ne', () => {
    expect(teamName({ nom: '', escola: null }, 1, t)).toBe('gimcana.teamNumber:2')
  })
})
