import type { AvisCompte, AvisPeriode } from './avisosApi'

/**
 * Quants avisos vius porta cadascú aquest curs, i qui ha passat el llindar.
 *
 * EL FORAT QUE TAPA. La migració 73 va deixar dues files a `point_values`
 * —`avisos.llindar` i `avisos.sostre_curs`— i una pantalla per moure-les. El
 * sostre el mira `avisa()` des del primer dia. El llindar no el mirava ningú:
 * era un número que la junta podia pujar i baixar sense que passés res, amb una
 * etiqueta —«Llindar per mirar-s'ho»— que promet que sí.
 *
 * PER QUÈ AQUÍ I NO A UNA RPC. L'issue demanava
 * «`avisos_del_periode(p_from, p_to)` o equivalent», i la primera versió
 * d'aquest canvi era la funció: `security definer`, `is_admin()`, la finestra
 * de `private.periode_curs()` i un `group by`. Es va escriure, es va validar
 * contra l'esquema real i es va descartar per tres motius, en aquest ordre:
 *
 *   LA FINESTRA JA ÉS AL CLIENT. L'argument fort de la RPC era que
 *   `private.periode_curs()` no l'exposa PostgREST i que comptar aquí
 *   obligaria a tornar a derivar quin és el curs actual. És fals: la fila
 *   `mena = 'global'` de `ranking_periods` és la primera per `ordre`, o sigui
 *   que `defaultPeriod(usePeriods())` ÉS `private.periode_curs()`, i el perfil i
 *   el rànquing ja la fan servir des de fa mesos. La regla no es duplica; ja
 *   vivia aquí.
 *
 *   I EL REGISTRE NO BAIXA. L'altre argument era no descarregar-se les notes de
 *   tothom a un telèfon per pintar un «2». També es resol sense RPC:
 *   `fetchAvisComptes` demana quatre columnes —qui, quanta gravetat, quan i si
 *   està retirat— i cap nota. Pel cable no hi passa ni un motiu.
 *
 *   I EL QUE QUEDAVA ERA UNA MIGRACIÓ QUE NO ES POT CÓRRER. Sense poder-la
 *   aplicar, ni el comptador ni la marca del llindar es podien obrir en una
 *   pantalla, i la regla de la casa és que allò que no s'ha executat no està
 *   fet. Sis sessions en paral·lel es reparteixen els números de migració i
 *   dues ja n'han xocat un; gastar-ne un per un `group by` de tres línies que
 *   el client pot fer amb dades que la junta ja llegeix era el pitjor dels dos
 *   costos.
 *
 * QUÈ COSTARIA TORNAR-HI. Si un dia això ha de sortir en un tauler amb milers
 * de files o l'ha de llegir algú que no sigui de la junta, la RPC torna: la
 * política d'`avisos` ja deixa la junta veure'l sencer i el `group by` es mou a
 * la base sense tocar cap pantalla. El que canviaria és `fetchAvisComptes`, i
 * prou.
 *
 * EL RETIRAT NO COMPTA, i aquesta és la decisió de fons. Un avís retirat
 * continua existint —la fila no s'esborra mai i surt ratllada a les dues
 * pantalles que la pinten— però no suma al comptador ni acosta ningú al
 * llindar. L'alternativa era comptar-lo igual i deixar que la junta ho tingués
 * al cap: voldria dir que retirar un avís no retira res, només torna els punts,
 * i llavors la retirada seria mitja retirada. Si la junta decideix que allò no
 * va passar, el comptador ho ha de saber.
 */

/** Zero vol dir «sense llindar», com el sostre a `avisa()`. */
export const SENSE_LLINDAR = 0

/**
 * Les files agrupades per persona, dins de la finestra.
 *
 * `des_de` i `fins_a` són les del curs, i qualsevol dels dos pot ser null —una
 * finestra oberta per aquell costat—, que és exactament el que fa
 * `private.periode_curs()` quan `ranking_periods` no té data de final. Un curs
 * que encara no s'ha acabat no és un error de configuració.
 */
export function compta(
  files: readonly AvisPeriode[],
  des_de: string | null,
  fins_a: string | null,
): Map<string, AvisCompte> {
  const out = new Map<string, AvisCompte>()

  for (const fila of files) {
    if (fila.retirat_at !== null) continue
    if (des_de !== null && fila.created_at < des_de) continue
    // Final exclusiu, com el `<` de `periode_curs()` a `avisa()`: el primer
    // instant del curs que ve és del curs que ve.
    if (fins_a !== null && fila.created_at >= fins_a) continue

    const abans = out.get(fila.user_id)
    out.set(fila.user_id, {
      quants: (abans?.quants ?? 0) + 1,
      gravetat: (abans?.gravetat ?? 0) + fila.gravetat,
    })
  }

  return out
}

/**
 * Si aquesta persona ha passat el llindar.
 *
 * `>=` I NO `>`. «Llindar 4» vol dir que amb quatre ja toca mirar-s'ho, que és
 * com es llegeix un llindar i no com es llegeix un màxim. Amb `>` la junta que
 * hi escriu 4 en descobriria el sentit el dia que algú arribés a 5.
 */
export function passaElLlindar(compte: AvisCompte | undefined, llindar: number): boolean {
  if (compte === undefined) return false
  if (llindar <= SENSE_LLINDAR) return false
  return compte.gravetat >= llindar
}

/** Quanta gent l'ha passat: el número que el rebedor de `/junta` ensenya. */
export function quantsPassen(comptes: ReadonlyMap<string, AvisCompte>, llindar: number): number {
  let n = 0
  for (const compte of comptes.values()) if (passaElLlindar(compte, llindar)) n += 1
  return n
}
