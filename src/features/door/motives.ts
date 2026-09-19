import type { PointValue } from '@/features/junta/eventFormApi'

/**
 * Quins botons dibuixa la pantalla de donar punts, i com queden a la graella.
 *
 * SURT DE LES DADES I NO D'UNA LLISTA ESCRITA AQUÍ. Les files `mena = 'motiu'`
 * de `point_values` són, literalment, «quins botons hi ha»: ho diu el comentari
 * de la taula des de la migració 15 i és el que la 25 formalitza quan es nega a
 * inventar-ne cap. Fins ara la porta en tenia una còpia a mà, i això era el
 * mateix error que aquesta feina arreglava en gran: el dia que una migració
 * afegís un motiu, la fila hi seria, la junta li podria posar preu a
 * `/junta/barem` i a la porta no hi sortiria cap botó. Ningú no ho veuria fins
 * que algú preguntés per què no pot donar-lo.
 *
 * DESCARTAT: deixar la llista escrita a `src/config/`, amb l'argument que el
 * que es dibuixa a la porta no ha de ballar mentre hi ha cua. L'argument no se
 * sosté: la pantalla ja es baixa `point_values` per posar el número dins de
 * cada botó, o sigui que el «+20» ja canvia sol quan la junta toca l'escala, i
 * només l'ordre i la presència es quedaven congelats. Congelar-ne la meitat és
 * el pitjor dels dos mons —un botó que diu un número nou i una llista que diu
 * la d'ahir— i té un cost de debò: mentre la còpia fos aquí, afegir un motiu
 * voldria dir una migració I un desplegament.
 *
 * `asistencia` i `manual` no hi són perquè no hi tenen fila: el primer el posa
 * el fitxatge de la porta i el segon l'ajust del full de la persona, i cap dels
 * dos és un botó d'aquesta pantalla. Això no és una excepció escrita aquí, és
 * el que diu la taula.
 */

export interface MotiveButton {
  readonly clau: string
  readonly punts: number
  /** Els dos primers van plens; la resta, amb vora. */
  readonly strong: boolean
  /**
   * Amb un nombre senar de motius l'últim queda tot sol a la segona fila, mig
   * forat al costat. S'estén en comptes de deixar-lo: l'alternativa era passar
   * a tres columnes, i «Proposta seva» en un terç d'amplada són tres línies en
   * català.
   */
  readonly wide: boolean
}

export function doorMotives(values: readonly PointValue[] | undefined): readonly MotiveButton[] {
  if (values === undefined) return []

  // `fetchPointValues` ja demana `order('ordre')`, però l'ordre hi torna a ser
  // perquè el que dibuixa la graella no pot dependre que una altra funció
  // recordi ordenar: el dia que algú hi afegeixi un filtre o un `select`
  // diferent, aquí els botons canviarien de lloc sense que res ho digués.
  //
  // El `sort` va sobre el que torna el `filter`, que ja és un array nou: la
  // llista que té React Query a la caché no es toca. Ordenar-la in situ seria
  // reordenar l'estat compartit de totes les pantalles que la llegeixen.
  const motius = values.filter((v) => v.mena === 'motiu').sort((a, b) => a.ordre - b.ordre)

  return motius.map((v, index) => ({
    clau: v.clau,
    punts: v.punts,
    strong: index < 2,
    wide: index === motius.length - 1 && motius.length % 2 === 1,
  }))
}
