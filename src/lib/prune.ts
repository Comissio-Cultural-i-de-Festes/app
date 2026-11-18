/**
 * Què sobra d'una carpeta de l'storage quan només n'ha de quedar una cosa.
 *
 * Cada foto que es pot substituir —l'avatar, la portada, les dues de la
 * porta— viu en una carpeta que és seva i de ningú més (`{uid}/`,
 * `{esdeveniment}/`, `entrada/{esdeveniment}/{uid}/`), i cada substitució hi
 * escriu un objecte nou en comptes de trepitjar el vell. Així, un cop la fila
 * apunta al nou, el que és més vell que ell a la carpeta és brossa, i no només
 * l'anterior: també la de la vegada que l'esborrat va fallar sense xarxa.
 *
 * Per això es mira la carpeta i no «l'anterior»: el camí d'abans el client no
 * sempre el té (un altre mòbil pot haver canviat la foto entremig), i el que hi
 * ha a la carpeta sí.
 *
 * NOMÉS EL QUE ÉS MÉS VELL. Dues pujades alhora —dos mòbils, o dos tocs seguits
 * amb mala cobertura— es poden desar en l'ordre contrari al que es van pujar, i
 * la que escombra la carpeta l'última no pot treure la que la fila acaba
 * d'apuntar. El que és més nou que el que es guarda es deixa: si sobra, ho
 * recull l'escombrada diària. Quan no es guarda res, o el que es guarda no és a
 * la carpeta, la vora és uns minuts enrere pel mateix motiu.
 */

export interface Listed {
  readonly name: string
  /** `null` vol dir subcarpeta: la llista de Storage les dona barrejades. */
  readonly id: string | null
  readonly created_at?: string | null
}

export const RECENT_MS = 5 * 60 * 1000

export function staleIn(
  folder: string,
  listed: readonly Listed[],
  keep: string | null,
  now: number,
): string[] {
  const files = listed.filter((entry) => entry.id !== null)
  const kept = files.find((entry) => `${folder}/${entry.name}` === keep)
  const keptAt = Date.parse(kept?.created_at ?? '')
  const edge = Number.isNaN(keptAt) ? now - RECENT_MS : keptAt

  return (
    files
      // Sense data no se sap si és més vell, i el que no se sap no s'esborra.
      .filter((entry) => Date.parse(entry.created_at ?? '') < edge)
      .map((entry) => `${folder}/${entry.name}`)
      .filter((path) => path !== keep)
  )
}
