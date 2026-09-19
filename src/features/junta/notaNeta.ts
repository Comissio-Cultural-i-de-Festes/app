/**
 * Què és un blanc quan es mira si una nota està escrita.
 *
 * PER QUÈ NO ÉS `String.prototype.trim()`. Perquè la base no ho és. Des de la
 * migració 77 la regla viu a `private.nota_neta`, que retalla els extrems amb
 * una llista EXPLÍCITA de blancs —`[[:space:]]` més els d'Unicode que no hi
 * entren sempre— i torna null quan no queda res. `trim()` de JavaScript
 * retalla la seva pròpia llista, que no és la mateixa: no toca U+001C–U+001F
 * (els separadors de fitxer, grup, registre i unitat), ni U+0085 (el salt de
 * línia dels terminals), ni U+200B (l'espai d'amplada zero).
 *
 * I LA DIFERÈNCIA ES VEIA A LA PANTALLA. Amb `trim()`, una nota que només fos
 * un espai d'amplada zero passava el formulari, `award_points` la refusava amb
 * 22023 i `errorKey()` el tradueix per classe a «Torna-ho a provar d'aquí un
 * moment»: el consell que no pot funcionar mai, perquè tornar-hi torna a
 * fallar. El formulari ha de refusar exactament el que refusa la base.
 *
 * COM ES MANTÉ LLIGAT, que és la meitat que costa. Dues proves, i cap de les
 * dues repeteix aquesta llista a mà:
 *
 *   · `tests/nota-neta-i-la-base.test.ts` llegeix l'última migració que
 *     defineix `private.nota_neta`, n'extreu la classe de caràcters i comprova
 *     que tot el que hi és explícit el retalli també `notaNeta`. Canviar la
 *     migració sense tocar aquest fitxer posa la prova vermella.
 *   · `tests/rls/junta_ajust.test.ts` compara els dos costats de debò,
 *     caràcter per caràcter, contra la base que hi ha a l'altra banda de
 *     PostgREST. És l'única capa que pot provar les dues direccions —«ni més
 *     ni menys»—, perquè `[[:space:]]` el decideix la configuració regional de
 *     la base i no hi ha cap manera honesta d'endevinar-lo des d'aquí.
 *
 * DESCARTAT: deixar el client permissiu i confiar en el missatge del servidor.
 * El 22023 arriba com a classe 22 i no porta el camp; la pantalla no podria
 * ensenyar la vora vermella al camp de la nota ni dir què falta, que és tota
 * la feina que fa aquest fitxer.
 *
 * DESCARTAT TAMBÉ: fer el client MÉS estricte que la base i prou —retallar
 * qualsevol cosa que `\s` de JavaScript reconegui—. Tapa el cas lleig, però
 * inventa un refús que la base no fa: qui enganxés un caràcter que la base
 * accepta veuria «falta la nota» amb la nota escrita, i aquest error no té cap
 * manera de resoldre'l.
 */

/**
 * Els blancs, com a trams de punts de codi.
 *
 * EN HEXADECIMAL I NO COM A CARÀCTERS DINS D'UNA CADENA: un tabulador, un
 * espai dur i una marca d'ordre de bytes escrits tal qual són una taca que
 * ningú no pot llegir ni revisar en un `diff`, i la primera versió d'aquest
 * fitxer es va escriure així.
 *
 * És la unió del que aquesta base considera `[[:space:]]` amb la llista
 * explícita de la migració 77. Els tres que `trim()` no cobreix hi són a
 * posta, i són l'única raó per la qual aquest fitxer existeix.
 */
export const BLANCS: readonly (readonly [number, number])[] = [
  [0x0009, 0x000d], // tabulador, salt de línia, tabulador vertical, salt de pàgina i retorn
  [0x001c, 0x001f], // separadors de fitxer, grup, registre i unitat — `trim()` no els veu
  [0x0020, 0x0020], // l'espai
  [0x0085, 0x0085], // el salt de línia dels terminals — `trim()` no el veu
  [0x00a0, 0x00a0], // l'espai dur, el que queda enganxat en copiar d'un processador de textos
  [0x1680, 0x1680], // l'espai d'ogham
  [0x2000, 0x200b], // de l'espai de quadratí a l'espai d'amplada zero — `trim()` no veu l'últim
  [0x2028, 0x2029], // els separadors de línia i de paràgraf
  [0x202f, 0x202f], // l'espai estret dur
  [0x205f, 0x205f], // l'espai matemàtic mitjà
  [0x3000, 0x3000], // l'espai ideogràfic
  [0xfeff, 0xfeff], // la marca d'ordre de bytes
]

/** Un tram, tal com s'escriu dins d'una classe de caràcters. */
function tram([des, fins]: readonly [number, number]): string {
  const inici = String.fromCodePoint(des)
  return des === fins ? inici : `${inici}-${String.fromCodePoint(fins)}`
}

/**
 * UN SOL PATRÓ I NO DOS, igual que a la migració: la llista apareix una vegada
 * i no se'n poden desincronitzar dues còpies. Si el text sencer és blanc, el
 * primer tros se'l menja tot i queda la cadena buida.
 */
const CLASSE = BLANCS.map(tram).join('')
const ELS_EXTREMS = new RegExp(`^[${CLASSE}]+|[${CLASSE}]+$`, 'g')

/**
 * La nota tal com la desarà la base, o la cadena buida si no en queda res.
 *
 * Torna `''` i no `null` perquè qui la crida ja compara amb `''` per saber si
 * el camp està escrit, i un tercer valor buit seria un tercer cas a mirar a
 * cada lloc.
 */
export function notaNeta(text: string): string {
  return text.replace(ELS_EXTREMS, '')
}
