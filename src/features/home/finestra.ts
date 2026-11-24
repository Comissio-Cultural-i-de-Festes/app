import { IN_PROGRESS_MS } from '@/lib/eventEnd'

/**
 * Què va a dalt de l'Inici i què a «L'última vegada».
 *
 * Abans tot penjava de `starts_at`: un esdeveniment deixava de ser «el que ve»
 * sis hores després de començar, durés el que durés. Per a una festa és la
 * nit; per a la casa rural, de divendres a les quatre a diumenge a les sis,
 * volia dir que divendres a les deu del vespre la fitxa —la gimcana, els
 * cotxes, el «Sóc aquí»— baixava a «hi vam ser» amb tothom encara a dins.
 *
 * Ara hi és fins que s'acaba, amb el final de `endOfEvent`: `ends_at`, i si no
 * en té, les sis hores de sempre. És el mateix final que fa servir la fitxa
 * per dir «en curs» o «ja ha passat», de manera que les dues pantalles canvien
 * d'opinió a la vegada. No és la regla de la junta (`finestra.ts` de la
 * junta), que es queda amb la més tardana de vuit hores o el final: la porta
 * vol tenir a mà la festa que s'ha allargat, i aquí una festa que diu que
 * s'acaba a les dotze ha de deixar el lloc a la següent quan s'acaba.
 *
 * «Ara» és l'horitzó més les sis hores, o sigui l'hora en punt: surt de la
 * mateixa clau de cau i no n'estrena cap, i el final es mira amb la mateixa
 * hora de marge que ja tenia l'inici. Les dates van entre cometes perquè
 * PostgREST llegeix el punt i els dos punts d'un ISO com a separadors dins
 * d'un `or`.
 */

function araDe(horizon: string): string {
  return new Date(Date.parse(horizon) + IN_PROGRESS_MS).toISOString()
}

/** Encara no s'ha acabat: sense final i començat dins de les sis hores, o amb un final que no ha arribat. */
export function alCartell(horizon: string): string {
  return `and(ends_at.is.null,starts_at.gte."${horizon}"),ends_at.gte."${araDe(horizon)}"`
}

/** El contrari exacte de `alCartell`: cap esdeveniment no surt a tots dos llocs ni s'escapa de tots dos. */
export function jaHiVamSer(horizon: string): string {
  return `and(ends_at.is.null,starts_at.lt."${horizon}"),ends_at.lt."${araDe(horizon)}"`
}
