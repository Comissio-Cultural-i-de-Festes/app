/**
 * Els dos camps d'una durada, i el número que en surt.
 *
 * DOS CAMPS I NO UN. «Una hora i mitja» s'escriu com es diu, i no cal
 * multiplicar de cap ni decidir si la coma d'«1,5» va amb coma o amb punt
 * segons el teclat que surti. La base guarda minuts sencers i la conversió viu
 * aquí, fora del component, perquè es pugui provar sense muntar cap pantalla.
 *
 * BUIT ÉS ZERO I NO ÉS INVÀLID. Qui esborra el camp dels minuts per escriure'n
 * un altre no ha de veure el botó de desar apagar-se-li a mitja frase. El que
 * sí que és invàlid és el que no és un número, el que és negatiu, i seixanta
 * minuts o més —que no són minuts, són una hora que va al camp del costat.
 */

export interface CampsHores {
  readonly hores: string
  readonly minuts: string
}

/** El màxim de la columna a la base: tres dies, que és prou per a una casa rural. */
const MAX_MINUTS = 4320

export function campsDesDeMinuts(minuts: number): CampsHores {
  const total = Math.max(0, Math.round(minuts))
  return { hores: String(Math.floor(total / 60)), minuts: String(total % 60) }
}

/** Els minuts que representen els dos camps, o null si no en representen cap. */
export function minutsDesDeCamps(camps: CampsHores): number | null {
  const hores = tros(camps.hores)
  const minuts = tros(camps.minuts)
  if (hores === null || minuts === null) return null
  if (minuts > 59) return null

  const total = hores * 60 + minuts
  return total > MAX_MINUTS ? null : total
}

function tros(text: string): number | null {
  const net = text.trim()
  if (net === '') return 0
  const n = Number(net)
  return Number.isInteger(n) && n >= 0 ? n : null
}
