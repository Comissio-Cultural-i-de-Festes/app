import type { AvisCompte } from './avisosApi'

/**
 * En quin escaló és cadascú, segons la normativa que la junta ha escrit.
 *
 * LA NORMATIVA SÓN SIS NÚMEROS DE `point_values` (migració 84): què pesa cada
 * gravetat —lleu, greu, molt greu— i a partir de quina suma de pesos una
 * persona passa a avís, a risc o a expulsió a votació. Aquest fitxer els llegeix
 * i decideix l'estat, i és l'únic lloc on es decideix: la llista de socis, la
 * fitxa i el rebedor de `/junta` han de dir el mateix de la mateixa persona.
 *
 * «EXPULSIÓ» NO EXPULSA. És l'escaló on la junta ha acordat votar-ho a la reunió
 * següent. L'app marca la fitxa i prou; la decisió, la confirmació i el botó de
 * baixa continuen sent humans i continuen sent a part.
 *
 * DE DALT A BAIX, i no «el primer que es passa». Els escalons no estan
 * obligats a anar en ordre —la 84 descarta un CHECK `risc > avis` per no
 * impedir que la junta n'apagui un posant-lo a zero—, o sigui que la resposta ha
 * de ser la mateixa amb qualsevol combinació: l'escaló més alt que està encès i
 * s'ha assolit. Amb «el primer per ordre», un risc escrit per sota de l'avís
 * deixaria algú a risc amb menys pes del que demana l'avís, i la pantalla diria
 * dues coses diferents segons en quin ordre es llegís.
 *
 * ZERO APAGA, com el sostre a `avisa()` i com l'antic llindar únic. I UNA FILA
 * QUE FALTA TAMBÉ VAL ZERO, a posta: si algú l'esborra, el que ha de passar és
 * que aquell escaló desaparegui, no que n'aparegui un d'inventat pel client. Un
 * valor per defecte aquí seria una normativa que la junta no ha escrit.
 */

export type EstatAvis = 'ok' | 'avis' | 'risc' | 'expulsio'

/** De menys a més greu. L'ordre en què es pinten i en què es compten. */
export const ESTATS: readonly EstatAvis[] = ['ok', 'avis', 'risc', 'expulsio']

export type Gravetat = 1 | 2 | 3

export type Pesos = Readonly<Record<Gravetat, number>>

export interface Llindars {
  readonly avis: number
  readonly risc: number
  readonly expulsio: number
}

export interface Normativa {
  readonly pesos: Pesos
  readonly llindars: Llindars
}

/**
 * El nom de cada estat i què es fa quan s'hi arriba.
 *
 * LES CLAUS VAN ESCRITES SENCERES, com a `avisTipus.ts`: `tests/i18n-unused`
 * troba una clau com a literal, i una plantilla fora d'un `t()` no ho és.
 *
 * `ok` NO TÉ «QUÈ FER», a posta: no és un escaló, és no haver-ne assolit cap.
 */
const CLAUS_ESTAT: Readonly<Record<EstatAvis, string>> = {
  ok: 'avisos.estat.ok',
  avis: 'avisos.estat.avis',
  risc: 'avisos.estat.risc',
  expulsio: 'avisos.estat.expulsio',
}

const CLAUS_QUE_FER_ESTAT: Readonly<Record<Exclude<EstatAvis, 'ok'>, string>> = {
  avis: 'avisos.queFer.estat.avis',
  risc: 'avisos.queFer.estat.risc',
  expulsio: 'avisos.queFer.estat.expulsio',
}

export function clauEstat(estat: EstatAvis): string {
  return CLAUS_ESTAT[estat]
}

export function clauQueFerEstat(estat: EstatAvis): string | null {
  return estat === 'ok' ? null : CLAUS_QUE_FER_ESTAT[estat]
}

/** Zero vol dir apagat: un escaló que no existeix, o un pes que no suma. */
export const APAGAT = 0

const CLAUS_PES: Readonly<Record<Gravetat, string>> = {
  1: 'pes_lleu',
  2: 'pes_greu',
  3: 'pes_molt_greu',
}

/** Les sis files de la normativa, d'entre totes les del barem. */
export function llegeixNormativa(
  values:
    readonly { readonly mena: string; readonly clau: string; readonly punts: number }[] | undefined,
): Normativa {
  const de = (clau: string): number =>
    values?.find((v) => v.mena === 'avisos' && v.clau === clau)?.punts ?? APAGAT

  return {
    pesos: { 1: de(CLAUS_PES[1]), 2: de(CLAUS_PES[2]), 3: de(CLAUS_PES[3]) },
    llindars: {
      avis: de('llindar_avis'),
      risc: de('llindar_risc'),
      expulsio: de('llindar_expulsio'),
    },
  }
}

/**
 * Què pesa un avís d'aquesta gravetat.
 *
 * Una gravetat fora de l'1-3 no hauria d'existir —el CHECK de la taula la fita—
 * i si arriba, no pesa: sumar-li un número inventat marcaria algú per una fila
 * que la base mateixa diu que no és vàlida.
 */
export function pesDe(gravetat: number, pesos: Pesos): number {
  return gravetat === 1 || gravetat === 2 || gravetat === 3 ? pesos[gravetat] : 0
}

/**
 * L'estat d'una persona amb el pes que porta aquest curs.
 *
 * `>=` I NO `>`: «avís 2» vol dir que amb dos ja hi és, que és com es llegeix un
 * escaló. `undefined` és qui no té cap avís viu, i és `ok`.
 */
export function estatDe(
  compte: Pick<AvisCompte, 'pes'> | undefined,
  llindars: Llindars,
): EstatAvis {
  const pes = compte?.pes ?? 0
  const arriba = (llindar: number) => llindar > APAGAT && pes >= llindar

  if (arriba(llindars.expulsio)) return 'expulsio'
  if (arriba(llindars.risc)) return 'risc'
  if (arriba(llindars.avis)) return 'avis'
  return 'ok'
}

/**
 * Quanta gent hi ha a cada escaló per sobre d'`ok`: el número del rebedor.
 *
 * `ok` no es compta aquí perquè d'aquest mapa no en surt: qui no té cap avís
 * viu no hi és. Qui el vulgui ha de restar dels socis actius.
 */
export function quantsPerEstat(
  comptes: ReadonlyMap<string, Pick<AvisCompte, 'pes'>>,
  llindars: Llindars,
): Readonly<Record<Exclude<EstatAvis, 'ok'>, number>> {
  const out = { avis: 0, risc: 0, expulsio: 0 }
  for (const compte of comptes.values()) {
    const estat = estatDe(compte, llindars)
    if (estat !== 'ok') out[estat] += 1
  }
  return out
}

/**
 * L'escaló on quedaria algú amb un avís més d'aquesta gravetat, si n'és un de
 * nou; `null` si es queda on és.
 *
 * ÉS EL QUE LA CONFIRMACIÓ D'UN AVÍS HA DE DIR, i per això és aquí i no al
 * formulari: «Amb aquest avís, Alfa passa a risc» és la conseqüència que la
 * junta ha de llegir abans de prémer, amb la mateixa regla que després pintarà
 * el xip. Si ho calculés el formulari pel seu compte, la frase i el xip podrien
 * dir dues coses.
 */
export function escaloNou(
  pesAra: number,
  gravetat: number,
  normativa: Normativa,
): EstatAvis | null {
  const abans = estatDe({ pes: pesAra }, normativa.llindars)
  const despres = estatDe({ pes: pesAra + pesDe(gravetat, normativa.pesos) }, normativa.llindars)
  return despres === abans ? null : despres
}
