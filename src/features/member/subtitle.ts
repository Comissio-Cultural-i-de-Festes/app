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
 * escola és.
 *
 * EL QUART TROS ES DIU `cua` I NO `desDe`, que és com va néixer. La línia
 * s'escrivia a mà a cinc pantalles i les cinc posen els mateixos tres primers
 * trossos; el que canvia és què hi va al final, i no sempre és «soci des de»:
 * a la fitxa de la junta hi va «Baixa», que és el que aquella pantalla ha de
 * dir i el perfil públic no. Amb el nom concret, quatre de les cinc còpies no
 * podien fer servir la funció i es quedaven copiades.
 *
 * Rep les etiquetes ja traduïdes en comptes de `t`: així la decisió —quins
 * trossos i en quin ordre— es pot provar sense muntar i18next, que és
 * exactament la part que es trencaria en silenci.
 */
export interface SubtitleParts {
  readonly escola: string | null
  readonly curs: string | null
  readonly grau: string | null
  /** L'últim: «soci des de 2024» al perfil públic, «Baixa» a la fitxa de la junta. */
  readonly cua: string | null
}

export function memberSubtitle(parts: SubtitleParts): string {
  return [parts.escola, parts.curs, parts.grau, parts.cua]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' · ')
}
