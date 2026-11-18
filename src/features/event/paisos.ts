/**
 * Els països, per a la nacionalitat i el país de residència.
 *
 * A LA BASE VA EL CODI (ISO 3166-1 alfa-2) i no el nom. «Espanya», «España» i
 * «Spain» són el mateix país, i el nom el decideix qui el llegeix: el soci al
 * formulari en la seva llengua, i el fitxer de la junta en català. El nom el
 * dona `Intl.DisplayNames`, que ja porta tots els països en totes les llengües;
 * escriure'ls aquí serien set-centes cadenes als tres locales que algú hauria
 * de mantenir.
 *
 * LA LLISTA DE CODIS SÍ QUE ÉS AQUÍ, perquè `Intl` no en dona cap: sap el nom
 * d'un codi però no quins codis hi ha. Són els 249 de l'estàndard, també els
 * territoris; triar quins són «de debò» no és feina d'un formulari.
 */

const CODIS = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ ' +
  'BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ ' +
  'DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY ' +
  'HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY ' +
  'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ ' +
  'NA NC NE NF NG NI NL NO NP NR NU NZ OM ' +
  'PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ ' +
  'TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ ' +
  'VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ')

export const CODIS_PAIS: readonly string[] = CODIS

/**
 * El nom d'un país en una llengua, o el codi si el navegador no el sap.
 *
 * El codi i no res: una cel·la buida al fitxer de la junta faria pensar que la
 * persona no l'ha posat, i «FR» es llegeix.
 */
export function nomDelPais(codi: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(codi) ?? codi
  } catch {
    return codi
  }
}

export interface Pais {
  readonly codi: string
  readonly nom: string
}

/**
 * Tots, per ordre alfabètic de la llengua de qui mira, amb Espanya al davant:
 * el registre de viatgers és una norma espanyola i la resposta de gairebé
 * tothom, i baixar fins a la E en un desplegable de dos-cents cinquanta és el
 * que fa que algú triï «Eslovènia» sense voler.
 */
export function paisosOrdenats(locale: string): Pais[] {
  const collator = new Intl.Collator(locale)
  const tots = CODIS.map((codi) => ({ codi, nom: nomDelPais(codi, locale) })).sort((a, b) =>
    collator.compare(a.nom, b.nom),
  )
  const primer = tots.find((p) => p.codi === 'ES')
  return primer === undefined ? tots : [primer, ...tots.filter((p) => p.codi !== 'ES')]
}
