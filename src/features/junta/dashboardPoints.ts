import type { MotiveRow } from './dashboardApi'

/**
 * D'on surten els punts, i el que no en surt.
 *
 * ESTÀ AQUÍ I NO DINS DE `DashboardScreen.tsx` perquè és lògica pura amb tres
 * decisions a dins —què és una font, quin és el denominador i com s'arrodoneix—
 * i cap d'elles no es podia provar sense muntar la pantalla sencera. La
 * partició va néixer dins del component amb la migració 80 i la ronda següent
 * hi va trobar un forat que una prova de quatre línies hauria vist.
 *
 * QUÈ ÉS UNA FONT DE PUNTS, I PER QUÈ NO ÉS EL SIGNE. La primera versió partia
 * la llista amb `punts > 0` i prou. El signe és la resposta correcta per a
 * `manual` —un ajust a mà que suma ÉS algú que ha guanyat punts— i és la
 * resposta equivocada per als avisos: un `avis_retirat` és positiu i no és cap
 * punt que hagi guanyat ningú, és un càstig que es desfà. Amb la finestra
 * posada al curs de la retirada i no al de l'avís, aquella fila entrava al
 * gràfic com una font més, competint amb muntatge i amb venir.
 *
 * LA MIGRACIÓ 82 HO TANCA A LA BASE i aquesta llista no hi hauria d'arribar
 * mai més positiva. Es comprova igualment aquí, i no és desconfiança: la base
 * i el client es despleguen per separat, els rollbacks de `supabase/rollbacks/`
 * existeixen per ser executats, i el dia que una base sense la 82 contesti a
 * un client amb la 82 el gràfic no ha de tornar a dibuixar una sanció com una
 * font. És barat i és la meitat que no depèn de quina versió té la base.
 *
 * EL DENOMINADOR ÉS EL DE LES FONTS, no el total de la llista. Amb el net, un
 * període amb avisos encongiria el denominador i les barres passarien del 100%:
 * «venir» no pot ser el 130% d'on surten els punts. Per això `sharePercents()`
 * rep les fonts i no la llista sencera: el denominador és la suma del que se li
 * dona, i partir primer és el que el fa correcte.
 */

/**
 * Els motius que no són mai una font de punts, passi el que passi amb el signe.
 *
 * Són les dues cares d'una sanció. `avis` és la resta i `avis_retirat` la seva
 * devolució; la 82 els agrupa tots dos sota `avis` abans d'arribar aquí, o
 * sigui que avui només el primer hi surt. El segon es queda escrit perquè una
 * base anterior a la 82 sí que el pot enviar.
 */
const SANCIONS: readonly string[] = ['avis', 'avis_retirat']

/** Una barra del gràfic: la fila, i la seva part del pastís ja repartida. */
export interface Bar extends MotiveRow {
  readonly pct: number
}

export interface PointsSplit {
  /** El que es dibuixa: motius que han donat punts, amb el seu percentatge. */
  readonly sources: readonly Bar[]
  /** El que va a la línia de text de sota, amb el seu signe. */
  readonly notSources: readonly MotiveRow[]
}

export function splitPoints(rows: readonly MotiveRow[]): PointsSplit {
  const isSource = (r: MotiveRow) => !SANCIONS.includes(r.motivo) && r.punts > 0
  const fonts = rows.filter(isSource)
  const pcts = sharePercents(fonts.map((r) => r.punts))
  return {
    sources: fonts.map((r, i) => ({ ...r, pct: pcts[i] ?? 0 })),
    notSources: rows.filter((r) => !isSource(r)),
  }
}

/**
 * Els percentatges de les barres, que sumen 100 exactament.
 *
 * ARRODONIR CADA FILA PEL SEU COMPTE NO SUMA 100 i el comentari del component
 * deia que sí. Tres motius amb la mateixa xifra donen 33 + 33 + 33 = 99, i la
 * targeta afirma d'un cop d'ull que allò és tot d'on surten els punts.
 *
 * MÈTODE DE LA RESTA MÉS GRAN. Cadascú s'endú la seva part sencera i els punts
 * que sobren van, d'un en un, a qui té la fracció més alta. És el repartiment
 * que menys s'allunya del número de debò —cap fila no es mou més d'un punt del
 * seu arrodoniment natural— i és estable: amb les mateixes dades surt sempre el
 * mateix, que en una taula que la junta mira cada mes importa.
 *
 * DESCARTAT: donar-li la diferència a la fila més gran, que és una línia menys.
 * Amb quatre motius gairebé iguals la primera barra se'n pot endur tres punts
 * de cop i deixar de correspondre's amb el seu propi número.
 *
 * DESCARTAT TAMBÉ: corregir la frase i deixar el 99. La targeta contesta «d'on
 * surten els punts» i la suma de les parts és mig la resposta; una llista de
 * percentatges que no tanca convida a buscar el que falta.
 *
 * Amb la llista buida o amb el total a zero torna zeros: no hi ha res a
 * repartir, i dividir per zero aquí donaria `NaN` a una amplada de CSS.
 */
export function sharePercents(values: readonly number[]): number[] {
  const total = values.reduce((n, v) => n + v, 0)
  if (total <= 0) return values.map(() => 0)

  const rows = values.map((v, i) => {
    const exact = (v / total) * 100
    const sencer = Math.floor(exact)
    return { i, v, sencer, resta: exact - sencer }
  })

  // Per resta descendent, i a igualtat la fila que ja era més gran: dues files
  // bessones han de repartir-se el punt que sobra sempre de la mateixa manera.
  const sobren = 100 - rows.reduce((n, r) => n + r.sencer, 0)
  const guanyen = new Set(
    [...rows]
      .sort((a, b) => b.resta - a.resta || b.v - a.v || a.i - b.i)
      .slice(0, Math.max(0, sobren))
      .map((r) => r.i),
  )

  return rows.map((r) => r.sencer + (guanyen.has(r.i) ? 1 : 0))
}
