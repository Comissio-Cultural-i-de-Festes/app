import type { AvisCompte, AvisPeriode } from './avisosApi'
import { type Pesos, pesDe } from './estatAvisos'

/**
 * Quants avisos vius porta cadascú aquest curs, i quant pesen.
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
 *   obligaria a tornar a derivar quin és el curs actual. Les files ja hi són:
 *   `ranking_periods` es llegeix des del rànquing i del perfil des de fa mesos.
 *   El que sí que calia era derivar-les amb la mateixa regla, i no amb una que
 *   s'hi assembli: `cursPeriod` fa `mena = 'global'` ordenat per `ordre` i
 *   `codi`, que és la frase de `private.periode_curs()` paraula per paraula.
 *   La primera versió d'aquest bloc deia que `defaultPeriod` ja ho feia i no
 *   era veritat —aquell no mira la `mena`—; coincidien per com estan sembrades
 *   les quatre files d'avui, que és la mena de coincidència que es trenca un
 *   setembre sense que ningú ho vegi.
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
 * pantalles que la pinten— però no suma al comptador ni acosta ningú a cap
 * escaló. L'alternativa era comptar-lo igual i deixar que la junta ho tingués
 * al cap: voldria dir que retirar un avís no retira res, només torna els punts,
 * i llavors la retirada seria mitja retirada. Si la junta decideix que allò no
 * va passar, el comptador ho ha de saber.
 */

/**
 * Si una fila és d'aquest curs.
 *
 * ESTÀ A PART PERQUÈ LA DEMANEN DOS. `compta()` la necessita per saber què suma
 * i la fitxa d'un soci la necessita per saber quines files ha de datar amb
 * l'any: allà la llista es baixa sencera —la junta hi ha de veure l'històric—
 * i el comptador de la capçalera només compta les d'aquest curs, o sigui que
 * les dues coses han de partir exactament de la mateixa condició. Amb la
 * condició escrita dues vegades, un `<` que es tornés `<=` en una de les dues
 * donaria un comptador i una llista que no quadren i cap manera de saber quin
 * s'equivoca. És el mateix motiu pel qual `useNormativa` existeix.
 *
 * `des_de` i `fins_a` són les del curs, i qualsevol dels dos pot ser null —una
 * finestra oberta per aquell costat—, que és exactament el que fa
 * `private.periode_curs()` quan `ranking_periods` no té data de final. Un curs
 * que encara no s'ha acabat no és un error de configuració.
 *
 * FINAL EXCLUSIU, com el `<` de `periode_curs()` a `avisa()`: el primer instant
 * del curs que ve és del curs que ve.
 */
export function dinsDelCurs(
  created_at: string,
  des_de: string | null,
  fins_a: string | null,
): boolean {
  if (des_de !== null && created_at < des_de) return false
  if (fins_a !== null && created_at >= fins_a) return false
  return true
}

/**
 * Les files agrupades per persona, dins de la finestra, amb el que pesen.
 *
 * EL PES I NO LA GRAVETAT. Fins a la migració 84 aquí se sumaven gravetats
 * (1, 2, 3) i el llindar únic les comparava; ara cada gravetat val el pes que la
 * junta hi ha escrit —lleu 1, greu 2, molt greu 4 de fàbrica— i el que se suma
 * és això. Qui llegeix l'estat que en surt és `estatDe()`, a `estatAvisos.ts`.
 */
export function compta(
  files: readonly AvisPeriode[],
  des_de: string | null,
  fins_a: string | null,
  pesos: Pesos,
): Map<string, AvisCompte> {
  const out = new Map<string, AvisCompte>()

  for (const fila of files) {
    if (fila.retirat_at !== null) continue
    if (!dinsDelCurs(fila.created_at, des_de, fins_a)) continue

    const abans = out.get(fila.user_id)
    out.set(fila.user_id, {
      quants: (abans?.quants ?? 0) + 1,
      pes: (abans?.pes ?? 0) + pesDe(fila.gravetat, pesos),
    })
  }

  return out
}
