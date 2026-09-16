/**
 * La línia de sota el nom: escola, curs, grau i des de quan hi és.
 *
 * Quatre trossos i cap d'ells obligatori. El grau és text lliure que la gent
 * escriu a l'alta, o sigui que pot ser la cadena buida i no només null; sense
 * comprovar-ho, la línia surt amb un «·» flotant al mig que sembla un error de
 * l'app i no un camp que algú no va omplir.
 *
 * L'ORDRE NO ÉS ALFABÈTIC NI ARBITRARI. És el mateix que la llista de socis de
 * la junta i el mateix que el teu propi perfil: escola, curs, grau. Qui obre
 * això ve de veure una cara en una llista i el que busca primer és de quina
 * escola és. «Soci des de» va l'últim perquè és l'únic que no serveix per
 * situar ningú: serveix per saber si fa molt que hi és.
 *
 * Rep les etiquetes ja traduïdes en comptes de `t`: així la decisió —quins
 * trossos i en quin ordre— es pot provar sense muntar i18next, que és
 * exactament la part que es trencaria en silenci.
 */
export interface SubtitleParts {
  readonly escola: string | null
  readonly curs: string | null
  readonly grau: string | null
  readonly desDe: string | null
}

export function memberSubtitle(parts: SubtitleParts): string {
  return [parts.escola, parts.curs, parts.grau, parts.desDe]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' · ')
}
