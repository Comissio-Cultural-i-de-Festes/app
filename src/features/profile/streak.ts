/**
 * Quin dels quatre estats de la ratxa toca, i si l'avís de trencada ja s'ha
 * tancat.
 *
 * Tot el que decideix una ratxa viu al servidor —quines activitats compten, què
 * la trenca i què no— i això és a posta: una ratxa calculada al navegador es
 * pot reescriure, i sobretot es desincronitzaria amb la del rànquing el dia que
 * la junta desfés un fitxatge. Aquí només hi ha la part de pantalla: quin dels
 * quatre dibuixos ensenyar i si l'avís ja s'ha llegit.
 *
 * L'AVÍS NO ES DESA AL SERVIDOR, i és una decisió. El disseny diu explícitament
 * «cap dada nova», i tancar un avís no és informació de l'associació: és una
 * preferència d'aquest telèfon. Guardar-ho seria una taula, una política i una
 * migració per recordar que algú ha premut «Entesos». El preu és que en un
 * segon dispositiu l'avís torna a sortir un cop, i és el preu correcte.
 */

const KEY = 'comi.streak.ack'

/** El que torna `my_streak()`. */
export interface Streak {
  readonly actual: number
  readonly millor: number
  /** Quant valia la que s'ha trencat. Zero quan `actual` és més gran que zero. */
  readonly perduda: number
  /** L'activitat que la va trencar, en ISO. Null si no n'hi ha cap. */
  readonly trencada_el: string | null
  readonly compten: number
  readonly hi_has_anat: number
}

/**
 * Els quatre dibuixos.
 *
 * `trencada` no és «zero amb un avís»: és un estat propi, perquè arriba una
 * vegada i marxa quan es llegeix, i el que queda a sota és `cap`.
 */
export type StreakShape = 'cap' | 'una' | 'moltes' | 'trencada'

function readAcked(): readonly string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    // Mode privat, emmagatzematge bloquejat, o les dades d'algú altre sota la
    // nostra clau. Fallar cap al costat d'ensenyar l'avís és el costat innocu.
    return []
  }
}

/**
 * «Entesos», recordat per ratxa trencada i no per persona.
 *
 * La clau és la data de l'activitat que la va trencar. Una sola bandera faria
 * que qui tanca l'avís del desembre no vegi mai més el del març, que és
 * exactament el moment en què tornaria a servir d'alguna cosa.
 */
export function ackStreakBreak(trencadaEl: string): void {
  try {
    const kept = [...new Set([...readAcked(), trencadaEl])].slice(-10)
    localStorage.setItem(KEY, JSON.stringify(kept))
  } catch {
    // Res a fer. L'avís torna a sortir, i és gris i petit.
  }
}

export function wasAcked(trencadaEl: string): boolean {
  return readAcked().includes(trencadaEl)
}

/**
 * Quin dels quatre.
 *
 * L'ordre importa: una ratxa viva mai ensenya res de trencat, encara que fa
 * tres mesos se'n trenqués una. El servidor ja ho garanteix posant `perduda` a
 * zero quan `actual` és més gran que zero, i això ho torna a dir aquí perquè la
 * pantalla no depengui d'haver-ho recordat.
 */
export function streakShape(streak: Streak): StreakShape {
  if (streak.actual >= 2) return 'moltes'
  if (streak.actual === 1) return 'una'
  if (streak.perduda > 0 && streak.trencada_el !== null && !wasAcked(streak.trencada_el)) {
    return 'trencada'
  }
  return 'cap'
}

/**
 * Si la ratxa d'aquesta persona depèn de l'activitat que està mirant.
 *
 * És l'única cosa de tota la fase que empeny, i empeny una vegada: una línia
 * sota la pregunta de si hi va, sense avís ni repetició. Amb zero no es diu res
 * — «comença una ratxa» a algú que no ha vingut mai és demanar-li una cosa que
 * encara no vol.
 */
export function streakIsAtStake(streak: Streak | undefined): boolean {
  return streak !== undefined && streak.actual > 0
}
