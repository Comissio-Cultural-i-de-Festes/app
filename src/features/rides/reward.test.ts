import { describe, expect, it } from 'vitest'

import type { PointValue } from '@/features/junta/eventFormApi'

import { rideReward } from './reward'

/**
 * La clau que les dues pantalles de cotxes ensenyen.
 *
 * El cas que importa és el tercer: una escala on `conduir` encara hi fos —una
 * base de dades a mig migrar, o una caché de React Query d'abans del desplegament—
 * no ha de fer sortir el seu número enlloc. Abans d'aquest fitxer la clau era
 * escrita a les dues pantalles i cap prova mirava quina era.
 */

const row = (clau: string, punts: number, mena = 'motiu'): PointValue => ({
  mena,
  clau,
  punts,
  ordre: 1,
})

describe('què val oferir un cotxe', () => {
  it('és el que digui la fila de portar gent', () => {
    expect(rideReward([row('montaje', 20), row('trajo_gente', 20), row('propuso', 25)])).toBe(20)
  })

  it('i segueix la fila quan la junta la canvia, sense desplegar res', () => {
    expect(rideReward([row('trajo_gente', 35)])).toBe(35)
  })

  it('mai el de conduir, encara que la fila vella hi sigui', () => {
    expect(rideReward([row('conduir', 25), row('trajo_gente', 20)])).toBe(20)
  })

  it('i amb conduir tot sol no diu res, en comptes de dir 25', () => {
    expect(rideReward([row('conduir', 25)])).toBeNull()
  })

  it('no confon una fila d’una altra mena que es digui igual', () => {
    expect(rideReward([row('trajo_gente', 99, 'tipus_esdeveniment')])).toBeNull()
  })
})

describe('quan encara no hi ha escala', () => {
  it('sense dades torna null, i no zero', () => {
    // Zero seria una frase —«oferir un cotxe no val res»— i el que passa és
    // que la consulta no ha tornat. Les pantalles ho distingeixen.
    expect(rideReward(undefined)).toBeNull()
  })

  it('i amb una escala buida, igual', () => {
    expect(rideReward([])).toBeNull()
  })

  it('una fila de zero punts sí que és zero, i no null', () => {
    // El `?? null` no pot menjar-se un 0 legítim: `point_values.punts` admet
    // zero i la junta podria posar-hi-ho per apagar el motiu sense esborrar-lo.
    expect(rideReward([row('trajo_gente', 0)])).toBe(0)
  })
})
