/**
 * El nom d'usuari d'Instagram: com s'escriu, què val i quin enllaç en surt.
 *
 * TRES FUNCIONS I UN SOL FITXER perquè les tres pantalles que el toquen —l'alta,
 * l'edició del perfil i la fila per seguir algú— han de coincidir exactament.
 * Si cadascuna es fes la seva normalització, una desaria `@algu` i l'altra
 * `algu`, i la pantalla del soci dibuixaria `instagram.com/@algu`.
 *
 * `isInstagramHandle` ÉS UNA CÒPIA DEL `CHECK` de la migració 70, i això és a
 * posta: la barrera de debò és la de la base de dades —`profiles` s'escriu amb
 * un `update` directe i el formulari no atura ningú— i aquesta d'aquí només
 * serveix perquè el camp pugui dir que no abans d'enviar, en comptes de tornar
 * un 23514 que la persona no pot interpretar. Si les dues es separen, el pitjor
 * que passa és un error lleig; si només hi hagués aquesta, el pitjor que passa
 * és un enllaç tocable cap on vulgui qui l'hi hagi desat.
 *
 * EL PATRÓ NO PORTA LA BANDERA `m`, I AQUESTA ÉS TOTA LA PRECAUCIÓ QUE CAL.
 * Aquí hi havia hagut un guard que comparava la llargada del que casa amb la
 * del text, i la raó escrita era que en JavaScript `$` casa abans d'un salt de
 * línia final. És falsa: això és Python, i sense `m` el `$` de JavaScript només
 * casa al final del text —`/^[A-Za-z0-9._]{1,30}$/.test('la_comi\n')` torna
 * `false`—. El guard, doncs, no podia canviar cap resultat: amb `^…$` i sense
 * `m` el que casa és sempre el text sencer o no hi ha match. S'ha tret i es
 * deixa dit, perquè una raó escrita que és falsa és pitjor que cap raó: qui la
 * llegís en trauria una conclusió equivocada sobre les expressions regulars
 * d'aquesta casa i la tornaria a posar.
 *
 * El que sí que importa és la bandera. Amb `m`, `$` casaria al final de la
 * PRIMERA línia i `algu\nhttps://el-que-sigui` passaria per aquí mentre el `~`
 * de Postgres el refusa amb un 23514 —el seu `$` tampoc no és sensible a les
 * línies si no li ho demanes—. Els dos casos amb salt de línia de la prova són
 * exactament això: no vigilen un salt final, vigilen que ningú afegeixi la `m`.
 */

/** El màxim que accepta Instagram, i el que diu el `CHECK` de la migració 70. */
export const INSTAGRAM_MAX = 30

const HANDLE = /^[A-Za-z0-9._]{1,30}$/

/**
 * El que algú escriu, convertit en el que la columna accepta —o null.
 *
 * Només `trim` i l'`@` del davant: no intenta endevinar res més. Si algú
 * enganxa una URL sencera, el que torna continua sent invàlid i el camp ho diu;
 * «arreglar-l'hi» voldria dir desar una cosa que la persona no ha escrit.
 *
 * Buit passa a null i no a `''` perquè la columna refusa la cadena buida: no
 * tenir-ne és l'absència de valor, no un valor que val res.
 */
export function normaliseInstagram(raw: string): string | null {
  const trimmed = raw.trim().replace(/^@/, '')
  return trimmed === '' ? null : trimmed
}

/** El mateix que el `CHECK` de la columna, ni més estret ni més ample. */
export function isInstagramHandle(value: string): boolean {
  return HANDLE.test(value)
}

/**
 * L'enllaç, construït aquí i enlloc més.
 *
 * `https://instagram.com/<nom>` i no `instagram://user?username=`: al mòbil amb
 * l'app instal·lada aquesta URL l'obre l'app tota sola, i si no hi és obre el
 * web. L'esquema propi no fa absolutament res quan l'app no hi és, i des de la
 * pàgina no hi ha manera de saber-ho per oferir una alternativa.
 */
export function instagramUrl(handle: string): string {
  return `https://instagram.com/${handle}`
}
