/**
 * Què val una fila del catàleg d'avisos abans d'enviar-la.
 *
 * FORA DEL COMPONENT, i no per simetria amb `adjust.ts`: dins d'`AvisTipusBlock`
 * les mateixes tres regles estaven escrites DUES vegades —una per a la fila que
 * s'edita i una per a la que s'afegeix— i cap de les dues tenia prova. Dues
 * còpies d'una regla són dues regles, i el dia que la CHECK d'`avis_tipus`
 * canviï només se'n corregirà una.
 *
 * NO SUBSTITUEIX LA BASE, la duplica a posta. `admin_set_avis_tipus` fa les
 * mateixes comprovacions i és ella qui mana: té el grant per a `authenticated`
 * sencer i qualsevol de la junta la pot cridar des de la consola. El que fa
 * aquest fitxer és que el refús arribi abans d'apretar i amb una frase escrita
 * per a qui la llegeix, en comptes d'un 22023 traduït a «errors.generic».
 *
 * ELS PUNTS SÓN NEGATIUS, I PER AIXÒ NO ES LLEGEIXEN AMB UN `<input
 * type="number">`. Al teclat numèric de l'iPhone no hi ha el signe menys, o
 * sigui que amb un camp numèric la meitat útil del catàleg —tot el que resta—
 * quedava darrere d'un canvi de teclat. `AdjustPointsBlock` ja ho havia trobat i
 * ho havia resolt amb `type="text" inputMode="numeric"` i el parseig aquí. Això
 * és la mateixa solució, i és el motiu pel qual aquest fitxer llegeix cadenes i
 * no números.
 *
 * UN CAMP BUIT NO ÉS UN ERROR A ENSENYAR. Qui encara no ha escrit res no s'ha
 * equivocat de res: el buit torna `null` i és la pantalla qui apaga el botó.
 * Mateix criteri que `llegeixAjust`.
 */

/** Els límits que posa la CHECK d'`avis_tipus`, i amb ella la RPC. */
export const MAX_RESTA = 500
export const GRAVETAT_MIN = 1
export const GRAVETAT_MAX = 3

/** La forma que la CHECK i `admin_set_avis_tipus` exigeixen a un `clau`. */
export const FORMA_CLAU = /^[a-z][a-z_]{0,23}$/

export interface CampsTipus {
  readonly gravetat: string
  readonly punts: string
}

export type ProblemaTipus = 'gravetat' | 'punts'

export interface TipusValid {
  readonly gravetat: number
  readonly punts_suggerits: number
}

/**
 * El número que hi ha escrit, o null si allò no és un enter.
 *
 * `Number('')` és 0 i `Number(' ')` també, que és com un camp buit acabaria
 * valent zero punts sense que ningú ho hagi escrit. Per això el buit se separa
 * abans, i no després.
 */
export function enter(text: string): number | null {
  const net = text.trim()
  if (net === '') return null
  const n = Number(net)
  return Number.isInteger(n) ? n : null
}

/** El que s'enviarà, quin camp encara no hi és, o null si encara no hi ha res. */
export function llegeixTipus(camps: CampsTipus): TipusValid | ProblemaTipus | null {
  const gravetat = enter(camps.gravetat)
  const punts = enter(camps.punts)

  if (camps.gravetat.trim() === '' && camps.punts.trim() === '') return null
  if (gravetat === null || gravetat < GRAVETAT_MIN || gravetat > GRAVETAT_MAX) return 'gravetat'
  if (punts === null || punts > 0 || punts < -MAX_RESTA) return 'punts'

  return { gravetat, punts_suggerits: punts }
}

/** Si el que ha tornat `llegeixTipus` es pot enviar. */
export function tipusValid(lectura: ReturnType<typeof llegeixTipus>): lectura is TipusValid {
  return lectura !== null && typeof lectura !== 'string'
}

export type ProblemaClau = 'forma' | 'repetida'

/**
 * Per què aquesta clau nova no serveix, o null si serveix.
 *
 * TORNA EL MOTIU I NO UN BOOLEÀ perquè fins ara una clau invàlida només apagava
 * el botó, sense dir-ne res. Qui escrivia «Se'n va aviat» amb majúscula i accent
 * es quedava amb un botó mort i cap frase, i la regla —minúscules, guions
 * baixos, comença per lletra— només era a la CHECK de la base i al text d'ajuda.
 *
 * El buit torna null, altre cop: encara no s'ha escrit res.
 */
export function problemaDeLaClau(clau: string, existents: readonly string[]): ProblemaClau | null {
  const net = clau.trim()
  if (net === '') return null
  if (!FORMA_CLAU.test(net)) return 'forma'
  if (existents.includes(net)) return 'repetida'
  return null
}
