import type { AvisTipus } from './avisosApi'

/**
 * El nom d'un tipus d'avís, i l'ordre en què es busca.
 *
 * TRES ESGLAONS I NO DOS. Primer la traducció, que és el que tenen els quatre
 * tipus que la migració 73 sembra i que es pinten com `badges.*` i `motive.*`:
 * clau dinàmica cap a `avisos.tipus.<clau>`. Després l'etiqueta que la junta hi
 * hagi posat, que és l'ÚNICA cosa que té un `clau` inventat des de
 * `/junta/barem` —cap fitxer de locales no el coneixerà mai—. I la clau crua
 * només com a últim recurs.
 *
 * Sense el segon esglaó, el dia que la junta afegís un tipus la pantalla
 * ensenyaria `se_en_va_aviat` a qui l'hagi de llegir. És la mateixa solució que
 * `ranking_periods.etiqueta`, i viu aquí i no dins del bloc perquè és una regla
 * i no un dibuix.
 */
/**
 * TRES GRAVETATS, I COM ES DIUEN A LA CARA DEL SOCI.
 *
 * L'issue deixava la pregunta oberta —«tres nombres a la base és una decisió
 * d'esquema; *lleu / greu / molt greu* a la pantalla és una decisió de to, i la
 * segona és la que la gent llegirà»— i fins avui no hi havia cap clau
 * `avisos.gravetat.*`: l'únic text era «Gravetat (1 a 3)» a la pantalla de
 * configuració, o sigui que a la fitxa d'una persona la seva gravetat sortia
 * com un número pelat o no sortia.
 *
 * TRES I NO QUATRE NI CINC. El `check (gravetat between 1 and 3)` d'`avis_tipus`
 * i d'`avisos` ja el fixa a tres, i canviar-ho seria una migració que toca dues
 * taules i totes les files que hi ha. Però el motiu de fons no és aquest: amb
 * cinc esglaons la junta discuteix si una cosa és un 3 o un 4 en comptes de si
 * cal registrar-la, i el llindar —que suma gravetats— es torna il·legible.
 *
 * ELS NOMS. «Lleu», «Greu» i «Molt greu», que és el que proposava l'issue. Es
 * va considerar i descartar «Avís / Avís seriós / Últim avís»: la tercera
 * promet una conseqüència que l'app no té —no dona de baixa ningú, i dir «últim»
 * quan després no passa res és pitjor que no dir res—. La gravetat descriu el
 * fet; el que se'n faci continua sent una decisió humana amb el seu propi botó.
 *
 * I PER QUÈ UNA FUNCIÓ I NO `t(\`avisos.gravetat.${n}\`)` a cada pantalla: el
 * número ve de la base i pot ser qualsevol cosa el dia que la CHECK s'ampliï o
 * que una fila vella se'n surti. Aquí es fita una vegada, i qui no conegui torna
 * `null` perquè la pantalla pugui ensenyar el número pelat —lleig, però cert—
 * en comptes d'una cadena buida que sembla que no hi hagi gravetat.
 *
 * LES TRES CLAUS VAN ESCRITES SENCERES i no muntades amb un literal de
 * plantilla, encara que muntar-les fos una línia. `tests/i18n-unused.test.ts`
 * troba una clau de tres maneres —literal, prefix dins d'un `t(\`…\${` , o
 * literal retornat per una funció— i una plantilla FORA d'un `t()` no és cap de
 * les tres: les tres claus li sortirien com a inabastables i el fitxer de
 * locales les perdria a la següent neteja. Aquesta és la tercera manera.
 */
const CLAUS_GRAVETAT: Readonly<Record<number, string>> = {
  1: 'avisos.gravetat.1',
  2: 'avisos.gravetat.2',
  3: 'avisos.gravetat.3',
}

export function clauGravetat(gravetat: number): string | null {
  return CLAUS_GRAVETAT[Math.trunc(gravetat)] ?? null
}

export function nomDelTipus(row: AvisTipus, traduit: string): string {
  const net = traduit.trim()
  // I LA CLAU I18N CRUA COMPTA COM A «NO HI HA TRADUCCIÓ». No és paranoia: el
  // cridador ha de passar '' quan no n'hi ha, però aquesta app arrenca amb
  // `returnEmptyString: false` i llavors `t()` torna la clau sencera en comptes
  // de la cadena buida. Va passar: un tipus afegit per la junta sortia a la
  // pantalla com «avisos.tipus.se_en_va_aviat». El cridador ho decideix bé amb
  // `i18n.exists`, i això és la xarxa de sota, perquè el mode de fallada és una
  // cadena lletja a la cara d'un soci i no un error que es vegi.
  if (net !== '' && net !== `avisos.tipus.${row.clau}`) return net
  const etiqueta = row.etiqueta?.trim() ?? ''
  if (etiqueta !== '') return etiqueta
  return row.clau
}
