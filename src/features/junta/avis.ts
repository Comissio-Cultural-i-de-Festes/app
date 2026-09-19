/**
 * Què val un avís abans d'enviar-lo.
 *
 * FORA DEL COMPONENT, com `adjust.ts`, perquè es pugui provar sense muntar cap
 * pantalla i perquè exportar-ho des del formulari només per a la prova trencaria
 * la regla del fast refresh.
 *
 * NO SUBSTITUEIX LA BASE. `avisa()` fa les mateixes comprovacions —nota
 * obligatòria, punts no positius, `abs(punts) <= 500`— i n'hi fa dues més que
 * aquí no es poden fer: el sostre de punts del curs i que la persona sigui de
 * l'associació. Aquelles tornen 22023 i la pantalla les ensenya traduïdes. El
 * que fa aquest fitxer és que les tres que sí que es poden saber abans arribin
 * abans d'apretar el botó.
 *
 * ELS PUNTS ARRENQUEN AL CATÀLEG I ES PODEN CANVIAR. `punts_suggerits` només
 * precarrega: un cop l'avís existeix, els seus punts són els seus. Per això el
 * camp és editable i per això el que es valida és el que hi ha escrit, no el
 * que deia el catàleg.
 *
 * I ZERO SÍ QUE ÉS UN AVÍS, al contrari que a `adjust.ts`, on zero no és cap
 * ajust. Aquí és el cas principal del primer avís: es pot avisar sense tocar el
 * rànquing, que és justament el que separa un avís d'una resta de punts. La
 * migració 73 ho diu amb totes les lletres i `avis_tipus.mal_gest` neix amb
 * zero.
 */

/** El sostre per crida que posa `avisa()`, el mateix que `award_points`. */
export const MAX_RESTA = 500

export interface CampsAvis {
  readonly tipus: string
  readonly punts: string
  readonly nota: string
}

export type ProblemaAvis = 'tipus' | 'punts' | 'nota'

export interface AvisValid {
  readonly tipus: string
  readonly punts: number
  readonly nota: string
}

/**
 * El que s'enviarà, o quin camp encara no hi és.
 *
 * L'ORDRE DELS TRES REFUSOS ÉS L'ORDRE DELS CAMPS A LA PANTALLA. Ensenyar
 * «falta el per què» mentre el tipus encara està sense triar faria mirar el
 * camp equivocat.
 *
 * Un camp encara en blanc torna `null` i prou: qui no ha escrit res no s'ha
 * equivocat de res, i és la pantalla qui apaga el botó. Mateix criteri que
 * `llegeixAjust`.
 */
export function llegeixAvis(camps: CampsAvis): AvisValid | ProblemaAvis | null {
  const tipus = camps.tipus.trim()
  const nota = camps.nota.trim()
  const escrit = camps.punts.trim()

  if (tipus === '') return null
  if (escrit === '') return nota === '' ? null : 'punts'

  const punts = Number(escrit)
  if (!Number.isInteger(punts) || punts > 0 || punts < -MAX_RESTA) return 'punts'
  if (nota === '') return 'nota'

  return { tipus, punts, nota }
}

/** Si el que ha tornat `llegeixAvis` es pot enviar. */
export function avisValid(lectura: ReturnType<typeof llegeixAvis>): lectura is AvisValid {
  return lectura !== null && typeof lectura !== 'string'
}

/**
 * I la nota de la retirada, que té la seva pròpia regla i la mateixa duresa.
 *
 * `retira_avis()` també refusa una nota en blanc amb 22023: retirar un avís és
 * un acte que queda escrit al costat del primer, i «error nostre» és el que
 * després explica per què hi ha un `+25` al llibre major. Una funció i no un
 * `!== ''` escampat: és la mateixa regla que la de dalt i ha de dir el mateix.
 */
export function notaValida(nota: string): boolean {
  const net = nota.trim()
  return net !== '' && net.length <= 500
}
