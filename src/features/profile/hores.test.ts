import { describe, expect, it } from 'vitest'

import { type HoresFila, notesDeLaFila } from './hores'

/**
 * La segona línia de la fila, que és l'única decisió que aquest bloc pren sol.
 *
 * El que hi ha en joc és que la llista es llegeixi: amb una segona línia a cada
 * fila, el desglossament d'un curs són trenta paràgrafs; sense cap, no es pot
 * dir que una xifra encara no està tancada.
 */

const BASE: HoresFila = {
  event_id: 'e-inventat',
  titol: 'Taller inventat',
  starts_at: '2026-10-03T16:00:00Z',
  tipo: 'actividad',
  minuts: 240,
  verificat: true,
}

describe('què diu la segona línia', () => {
  it('no diu res quan no hi ha res a dir', () => {
    expect(notesDeLaFila(BASE)).toEqual([])
  })

  it('diu «pendent» mentre la junta no ho ha visat', () => {
    expect(notesDeLaFila({ ...BASE, verificat: false })).toEqual(['pendent'])
  })

  it('diu «reunió», que és l’única mena d’activitat que s’anomena', () => {
    expect(notesDeLaFila({ ...BASE, tipo: 'reunio' })).toEqual(['reunio'])
  })

  it('i les ajunta, primer què va ser i després en quin punt està', () => {
    expect(notesDeLaFila({ ...BASE, tipo: 'reunio', verificat: false })).toEqual([
      'reunio',
      'pendent',
    ])
  })

  // El cas que fa que la persona pugui resoldre-ho: si només diguéssim
  // «pendent» esperaria la junta, i el que falta és una foto seva.
  it('amb els minuts a null diu que hi falta la sortida, i no «pendent»', () => {
    expect(notesDeLaFila({ ...BASE, minuts: null, verificat: false })).toEqual(['sense_sortida'])
  })

  it('i ho diu també en una que ja està visada', () => {
    expect(notesDeLaFila({ ...BASE, minuts: null })).toEqual(['sense_sortida'])
  })

  // El control positiu del de dalt: zero minuts NO és el mateix que no saber-ho,
  // i una activitat de zero minuts visada no ha de dir res.
  it('i zero minuts no és no saber-ho', () => {
    expect(notesDeLaFila({ ...BASE, minuts: 0 })).toEqual([])
  })
})
