import { describe, expect, it } from 'vitest'

import type { PointValue } from '@/features/junta/eventFormApi'

import { doorMotives } from './motives'

/**
 * El que aquestes proves fixen no és la graella, és d'on surt.
 *
 * La versió d'abans tenia la llista escrita a la pantalla i el número baixat de
 * la base de dades, i el forat que això obria no es veia des de cap prova: el
 * dia que una migració afegís un motiu, la fila hi seria, la junta li podria
 * posar preu i a la porta no hi sortiria cap botó. Per això el cas central
 * d'aquest fitxer és un motiu que no existeix enlloc del codi.
 *
 * Els noms de fila són els que hi ha de debò a `point_values` després de la
 * migració 71, més invents on cal.
 */

const row = (clau: string, punts: number, ordre: number, mena = 'motiu'): PointValue => ({
  mena,
  clau,
  punts,
  ordre,
})

// Tal com els torna `fetchPointValues`: les tres menes barrejades, ordenades
// per `ordre` a la consulta i per tant NO agrupades per mena.
const ESCALA: readonly PointValue[] = [
  row('llindar', 4, 1, 'avisos'),
  row('montaje', 20, 1),
  row('fiesta', 10, 1, 'tipus_esdeveniment'),
  row('sostre_curs', 200, 2, 'avisos'),
  row('trajo_gente', 20, 2),
  row('propuso', 25, 3),
  row('reunio', 5, 40, 'tipus_esdeveniment'),
]

describe('els botons de la pantalla de donar punts', () => {
  it('són els motius de l’escala i cap altra mena de fila', () => {
    expect(doorMotives(ESCALA).map((m) => m.clau)).toEqual(['montaje', 'trajo_gente', 'propuso'])
  })

  it('porten el número de la fila, no cap constant', () => {
    expect(doorMotives(ESCALA).map((m) => m.punts)).toEqual([20, 20, 25])
  })

  it('i conduir no hi és, que és el que la migració 71 va treure', () => {
    expect(doorMotives(ESCALA).some((m) => m.clau === 'conduir')).toBe(false)
  })

  it('un motiu nou que la junta afegeixi surt sol, sense desplegar res', () => {
    // El cas que la versió amb la llista escrita a mà no podia passar. La clau
    // no apareix a cap altre lloc del codi a posta: si això passés per una
    // llista literal, aquesta prova fallaria.
    const ampliada = [...ESCALA, row('cartells', 12, 4)]

    expect(doorMotives(ampliada).map((m) => m.clau)).toEqual([
      'montaje',
      'trajo_gente',
      'propuso',
      'cartells',
    ])
    expect(doorMotives(ampliada).at(-1)?.punts).toBe(12)
  })

  it('i si la junta reordena l’escala, els botons la segueixen', () => {
    const girada = [row('propuso', 25, 1), row('trajo_gente', 20, 2), row('montaje', 20, 3)]

    expect(doorMotives(girada).map((m) => m.clau)).toEqual(['propuso', 'trajo_gente', 'montaje'])
  })

  it('ordena per `ordre` encara que la consulta els doni desordenats', () => {
    // `fetchPointValues` ja demana `order('ordre')`, i això és el que passa el
    // dia que algú li canviï el `select`.
    const desordenada = [row('propuso', 25, 3), row('montaje', 20, 1), row('trajo_gente', 20, 2)]

    expect(doorMotives(desordenada).map((m) => m.clau)).toEqual([
      'montaje',
      'trajo_gente',
      'propuso',
    ])
  })

  it('no reordena la llista que li han passat', () => {
    // És la caché de React Query: ordenar-la in situ reordenaria l'escala per a
    // totes les pantalles que la llegeixen.
    const original = [row('propuso', 25, 3), row('montaje', 20, 1)]
    const copia = [...original]
    doorMotives(original)

    expect(original).toEqual(copia)
  })
})

describe('com queden a la graella de dues columnes', () => {
  it('els dos primers van plens i la resta amb vora', () => {
    expect(doorMotives(ESCALA).map((m) => m.strong)).toEqual([true, true, false])
  })

  it('amb un nombre senar, l’últim s’estén per no deixar mig forat', () => {
    expect(doorMotives(ESCALA).map((m) => m.wide)).toEqual([false, false, true])
  })

  it('i amb un nombre parell no s’estén cap', () => {
    const quatre = [...ESCALA, row('cartells', 12, 4)]

    expect(doorMotives(quatre).map((m) => m.wide)).toEqual([false, false, false, false])
  })

  it('amb un sol motiu, aquell ocupa la fila sencera', () => {
    expect(doorMotives([row('trajo_gente', 20, 1)])).toEqual([
      { clau: 'trajo_gente', punts: 20, strong: true, wide: true },
    ])
  })
})

describe('mentre no hi ha escala', () => {
  it('sense dades no hi ha cap botó, i no una graella de botons apagats', () => {
    expect(doorMotives(undefined)).toEqual([])
  })

  it('i una escala sense cap motiu tampoc en dibuixa cap', () => {
    expect(doorMotives([row('fiesta', 10, 1, 'tipus_esdeveniment')])).toEqual([])
  })
})
