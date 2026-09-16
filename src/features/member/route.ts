/**
 * On viu el perfil d'un altre soci, escrit una sola vegada.
 *
 * S'hi arriba des de cinc pantalles i cap d'elles ha de repetir la cadena: si
 * un dia canvia de nom, canvia aquí. És el mateix motiu pel qual `App` exporta
 * `PRIVACY_PATH` i `TERMS_PATH`.
 *
 * En un fitxer sense components a posta: exportar una funció des del mateix
 * mòdul que un component trenca el refresc en calent, i la regla de lint que ho
 * vigila hi és precisament perquè això va passar abans.
 */
export const memberPath = (userId: string) => `/soci/${userId}`

/**
 * El que un enllaç deixa dit sobre d'on ve.
 *
 * `/soci/:id` no té barra de pestanyes, o sigui que l'única sortida és la
 * fletxa de la capçalera, i aquella fletxa ha de tornar al lloc d'on s'ha
 * vingut: qui hi arriba des de «qui hi ha dins» d'una festa no vol acabar al
 * Rànquing. `history.back()` faria el mateix però no sap dir com es diu el
 * lloc, i la fletxa d'aquesta app sempre porta l'etiqueta d'on va.
 */
export interface MemberFrom {
  readonly from?: string
  readonly fromLabel?: string
}

/**
 * El que ha arribat a `location.state`, que és `unknown` i pot ser qualsevol cosa.
 *
 * Es comprova que sigui un camí d'aquesta app i no una adreça. Un estat de
 * navegació amb «https://…» o amb «//un.altre.lloc» convertiria la fletxa de
 * tornar en un enllaç cap a fora, i la fletxa de tornar és precisament el
 * control que la gent prem sense mirar on va.
 */
export function readFrom(state: unknown): MemberFrom {
  if (typeof state !== 'object' || state === null) return {}
  const { from, fromLabel } = state as Record<string, unknown>

  const out: { from?: string; fromLabel?: string } = {}
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) out.from = from
  if (typeof fromLabel === 'string' && fromLabel !== '') out.fromLabel = fromLabel
  return out
}
