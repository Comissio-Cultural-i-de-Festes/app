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
 * recull l'escombrada diària.
 *
 * Quan no es guarda res —treure la foto, tornar a la de Google, esborrar
 * l'esdeveniment— no hi ha cap fila que pugui quedar apuntant a res, i se'n va
 * tota la carpeta.
 */

export interface Listed {
  readonly name: string
  /** `null` vol dir subcarpeta: la llista de Storage les dona barrejades. */
  readonly id: string | null
  readonly created_at?: string | null
}

export function staleIn(folder: string, listed: readonly Listed[], keep: string | null): string[] {
  const files = listed.filter((entry) => entry.id !== null)
  const kept = files.find((entry) => `${folder}/${entry.name}` === keep)
  if (kept === undefined) return files.map((entry) => `${folder}/${entry.name}`)

  // Sense data no se sap què és més vell, i el que no se sap no s'esborra.
  const keptAt = Date.parse(kept.created_at ?? '')
  return files
    .filter((entry) => Date.parse(entry.created_at ?? '') < keptAt)
    .map((entry) => `${folder}/${entry.name}`)
}
