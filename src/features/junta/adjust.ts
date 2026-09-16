/**
 * Què val un ajust manual abans d'enviar-lo.
 *
 * FORA DEL COMPONENT perquè es pugui provar sense muntar cap pantalla, i
 * perquè exportar-ho des de la pantalla només per a la prova trencaria la
 * regla del fast refresh.
 *
 * NO SUBSTITUEIX LA BASE, la duplica a posta. La migració 69 fa les mateixes
 * dues comprovacions dins d'`award_points`, que és on han de ser: la RPC té el
 * grant per a `authenticated` sencer i qualsevol de la junta la pot cridar des
 * de la consola. El que fa aquest fitxer és que el refús arribi abans
 * d'apretar el botó i amb una frase escrita per a qui la llegeix, en comptes
 * d'un 22023 traduït a «errors.generic».
 *
 * EL SIGNE VA DINS DEL NÚMERO. Un parell de botons +/− al costat d'un camp
 * sense signe és un estat més per mantenir i una pregunta més per contestar
 * («si escric -20 i el botó diu +, què val?»). Aquí «-20» és -20, que és com
 * s'escriu a mà en un paper.
 *
 * ZERO NO ÉS UN AJUST. La RPC el refusa des de la 15 i aquí també: una fila de
 * zero punts al llibre major és soroll amb data.
 */

/** El sostre per crida que posa `award_points` des de la migració 15. */
export const MAX_AJUST = 500

export interface CampsAjust {
  readonly punts: string
  readonly nota: string
}

export type ProblemaAjust = 'punts' | 'nota'

export interface AjustValid {
  readonly punts: number
  readonly nota: string
}

/**
 * El que s'enviarà, o quin camp encara no hi és.
 *
 * Torna el problema i no un booleà perquè la pantalla n'ha de pintar dues
 * coses diferents —quin camp té la vora vermella i quina frase surt a sota— i
 * decidir-ho dues vegades és decidir-ho dues vegades malament.
 *
 * Un camp BUIT no és un problema a ensenyar: qui encara no ha escrit res no
 * s'ha equivocat de res. Per això el buit torna `null` i prou, i és la
 * pantalla qui apaga el botó.
 */
export function llegeixAjust(camps: CampsAjust): AjustValid | ProblemaAjust | null {
  const punts = Number(camps.punts.trim())
  const nota = camps.nota.trim()

  if (camps.punts.trim() === '') return nota === '' ? null : 'punts'
  if (!Number.isInteger(punts) || punts === 0 || Math.abs(punts) > MAX_AJUST) return 'punts'
  if (nota === '') return 'nota'

  return { punts, nota }
}

/** Si el que ha tornat `llegeixAjust` es pot enviar. */
export function esValid(lectura: ReturnType<typeof llegeixAjust>): lectura is AjustValid {
  return lectura !== null && typeof lectura !== 'string'
}
