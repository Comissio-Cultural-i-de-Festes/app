import type { Escola } from '@/lib/model'

/**
 * Què posar al lloc de l'escola: l'escola, «De fora», o res.
 *
 * Torna la clau i no el text, pel mateix motiu que `memberSubtitle` rep les
 * etiquetes ja traduïdes: la decisió es pot provar sense muntar i18next.
 *
 * «De fora» i no «Sense escola». Un extern no és algú a qui falta un camp, és
 * algú que ha contestat que no en té cap (migració 96); i «Sense escola», que
 * és el que la junta veu en un pendent, vol dir justament que encara no ha
 * contestat. Les dues coses han de ser distingibles a la mateixa llista.
 *
 * `extern` és opcional perquè no totes les consultes el demanen: les que
 * passen per funcions SQL (`ranking_period`, `check_in`) encara no el
 * retornen, i allà un extern simplement surt sense escola.
 */
export function escolaKey(p: {
  readonly escola: Escola | null
  readonly extern?: boolean
}): `escolaShort.${Escola}` | 'extern' | null {
  if (p.escola !== null) return `escolaShort.${p.escola}`
  return p.extern === true ? 'extern' : null
}
