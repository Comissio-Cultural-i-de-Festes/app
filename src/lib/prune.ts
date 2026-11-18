/**
 * Què sobra d'una carpeta de l'storage quan només n'ha de quedar una cosa.
 *
 * Cada foto que es pot substituir —l'avatar, la portada, les dues de la
 * porta— viu en una carpeta que és seva i de ningú més (`{uid}/`,
 * `{esdeveniment}/`, `entrada/{esdeveniment}/{uid}/`), i cada substitució hi
 * escriu un objecte nou en comptes de trepitjar el vell. Així, un cop la fila
 * apunta al nou, tota la resta de la carpeta és brossa, i no només l'anterior:
 * també la de la vegada que l'esborrat va fallar sense xarxa.
 *
 * Per això es mira la carpeta i no «l'anterior»: el camí d'abans el client no
 * sempre el té (un altre mòbil pot haver canviat la foto entremig), i el que hi
 * ha a la carpeta sí.
 */

export interface Listed {
  readonly name: string
  /** `null` vol dir subcarpeta: la llista de Storage les dona barrejades. */
  readonly id: string | null
}

export function staleIn(folder: string, listed: readonly Listed[], keep: string | null): string[] {
  return listed
    .filter((entry) => entry.id !== null)
    .map((entry) => `${folder}/${entry.name}`)
    .filter((path) => path !== keep)
}
