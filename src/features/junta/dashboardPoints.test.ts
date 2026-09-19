import { describe, expect, it } from 'vitest'

import type { MotiveRow } from './dashboardApi'
import { sharePercents, splitPoints } from './dashboardPoints'

/**
 * La partició del gràfic de «d'on surten els punts».
 *
 * Fins ara vivia dins de `DashboardScreen.tsx` i no tenia cap prova. Les dues
 * coses que es fixen aquí són exactament les dues que hi van fallar: que una
 * sanció no és mai una font de punts encara que el número sigui positiu, i que
 * els percentatges sumen 100, que és el que el comentari d'allà afirmava sense
 * que fos cert.
 *
 * Els números són inventats i rodons a posta: el que es llegeix és el
 * repartiment, no la xifra.
 */

const fila = (motivo: string, punts: number, vegades = 1): MotiveRow => ({
  motivo,
  punts,
  vegades,
})

describe('què és una font de punts', () => {
  it('els motius que sumen van al gràfic, de més a menys', () => {
    const out = splitPoints([fila('asistencia', 300), fila('montaje', 90)])
    expect(out.sources.map((r) => r.motivo)).toEqual(['asistencia', 'montaje'])
    expect(out.notSources).toEqual([])
  })

  it('un ajust a mà que resta surt del gràfic i va a la línia de sota', () => {
    const out = splitPoints([fila('asistencia', 300), fila('manual', -40)])
    expect(out.sources.map((r) => r.motivo)).toEqual(['asistencia'])
    expect(out.notSources.map((r) => r.motivo)).toEqual(['manual'])
  })

  it('i un ajust a mà que suma sí que hi és: allà el signe és la resposta bona', () => {
    const out = splitPoints([fila('asistencia', 300), fila('manual', 40)])
    expect(out.sources.map((r) => r.motivo)).toEqual(['asistencia', 'manual'])
  })

  /*
   * L'ASSERCIÓ QUE FIXA EL FORAT. Una finestra que conté la retirada d'un avís
   * i no l'avís: la base d'abans de la migració 82 hi contesta `avis` amb un
   * número positiu, i partint només pel signe allò era una barra del gràfic al
   * costat de muntatge i de venir.
   */
  it('un avís no és mai una font de punts, ni amb el número positiu', () => {
    const out = splitPoints([fila('asistencia', 300), fila('avis', 25, 0)])
    expect(out.sources.map((r) => r.motivo)).toEqual(['asistencia'])
    expect(out.notSources.map((r) => r.motivo)).toEqual(['avis'])
  })

  it('i tampoc la seva retirada, que és com la contesta una base sense la 82', () => {
    const out = splitPoints([fila('asistencia', 300), fila('avis_retirat', 25)])
    expect(out.sources.map((r) => r.motivo)).toEqual(['asistencia'])
    expect(out.notSources.map((r) => r.motivo)).toEqual(['avis_retirat'])
  })

  it('un avís que es manté també va a sota, com qualsevol motiu que resta', () => {
    const out = splitPoints([fila('asistencia', 300), fila('avis', -25)])
    expect(out.notSources.map((r) => r.motivo)).toEqual(['avis'])
  })

  it('cap fila no es perd pel camí', () => {
    const files = [fila('asistencia', 300), fila('avis', 25, 0), fila('manual', 0)]
    const out = splitPoints(files)
    expect(out.sources.length + out.notSources.length).toBe(files.length)
  })

  it('sense cap fila no peta', () => {
    expect(splitPoints([])).toEqual({ sources: [], notSources: [] })
  })
})

describe('els percentatges de les barres', () => {
  it('sumen 100 quan l’arrodoniment de cadascú donaria 99', () => {
    const out = sharePercents([10, 10, 10])
    expect(out.reduce((n, v) => n + v, 0)).toBe(100)
    expect(out).toEqual([34, 33, 33])
  })

  it('i també quan donaria 101', () => {
    const out = sharePercents([1, 1, 1, 1, 1, 1])
    expect(out.reduce((n, v) => n + v, 0)).toBe(100)
  })

  it('cap fila no es mou més d’un punt del seu arrodoniment natural', () => {
    const valors = [317, 213, 97, 61, 12]
    const total = valors.reduce((n, v) => n + v, 0)
    const pcts = sharePercents(valors)
    valors.forEach((v, i) => {
      expect(Math.abs((pcts[i] ?? 0) - (v / total) * 100)).toBeLessThan(1)
    })
  })

  it('amb una sola fila val 100', () => {
    expect(sharePercents([42])).toEqual([100])
  })

  it('sense fonts no divideix per zero', () => {
    expect(sharePercents([])).toEqual([])
    expect(sharePercents([0, 0])).toEqual([0, 0])
  })

  it('les fonts d’una targeta de debò tanquen la targeta', () => {
    const out = splitPoints([fila('asistencia', 300), fila('montaje', 90), fila('avis', -25)])
    const pcts = sharePercents(out.sources.map((r) => r.punts))
    expect(pcts.reduce((n, v) => n + v, 0)).toBe(100)
  })
})
