import { nomDelPais } from '@/features/event/paisos'
import type { Sexe, TipusDocument } from '@/features/event/viatger'

/**
 * El fitxer de dades de viatger que la junta envia a l'allotjament.
 *
 * UNA COLUMNA PER CAMP, EN L'ORDRE DE L'ISSUE i amb les capçaleres en català
 * sigui quina sigui la llengua de la junta: el fitxer va a una casa d'aquí, no
 * a la pantalla de qui l'exporta, i dues exportacions del mateix esdeveniment
 * han de ser el mateix fitxer. Per això les capçaleres i els valors són aquí i
 * no als locales.
 *
 * PER A L'EXCEL D'AQUÍ, que és on s'obrirà:
 *
 *   PUNT I COMA I NO COMA. L'Excel en català o en castellà fa servir la coma de
 *   separador decimal i, en obrir un CSV amb doble clic, espera `;`. Amb comes
 *   tot surt en una sola columna. La línia `sep=,` ho arreglaria per a les
 *   comes, però fa que l'Excel ignori el BOM i llavors els accents surten
 *   trencats, que és pitjor.
 *
 *   BOM UTF-8 AL DAVANT. Sense, l'Excel llegeix el fitxer en Windows-1252 i
 *   «Martínez» surt «MartÃ­nez».
 *
 *   CRLF entre files, que és el que diu la RFC 4180 i el que l'Excel espera.
 *
 * LA INJECCIÓ DE FÓRMULES. Una cel·la que comença per `=`, `+`, `-` o `@` (o
 * per un tabulador o un retorn) l'Excel la pot executar com a fórmula: una
 * adreça escrita com `=HYPERLINK(...)` és un enllaç que s'obre des de
 * l'ordinador de la junta. Es neutralitza amb un apòstrof davant, que és la
 * recomanació d'OWASP. El preu, dit: un telèfon amb prefix, `+33…`, surt amb
 * l'apòstrof visible. És el mateix número i no s'executa res.
 */

export interface DadesViatger {
  readonly nom: string
  readonly cognom1: string
  readonly cognom2: string | null
  readonly sexe: Sexe
  readonly tipus_document: TipusDocument
  readonly numero_document: string
  readonly numero_suport: string | null
  readonly nacionalitat: string
  readonly data_naixement: string
  readonly adreca: string
  readonly localitat: string
  readonly pais: string
  readonly telefon_emergencia: string
}

const CAPCALERES = [
  'Nom',
  'Primer cognom',
  'Segon cognom',
  'Sexe',
  'Tipus de document',
  'Número de document',
  'Número de suport',
  'Nacionalitat',
  'Data de naixement',
  'Adreça',
  'Localitat',
  'País',
  "Telèfon d'emergència",
] as const

const SEXE: Readonly<Record<Sexe, string>> = { dona: 'Dona', home: 'Home', altre: 'Altre' }

const DOCUMENT: Readonly<Record<TipusDocument, string>> = {
  dni: 'DNI',
  nie: 'NIE',
  passaport: 'Passaport',
  id_ue: "Document d'identitat de la UE",
}

const BOM = '\uFEFF'
const SEP = ';'
const EOL = '\r\n'

/** `YYYY-MM-DD` → `DD/MM/YYYY`, que és com s'escriu una data aquí. */
function dataDMA(iso: string): string {
  const [any, mes, dia] = iso.split('-')
  return `${dia ?? ''}/${mes ?? ''}/${any ?? ''}`
}

/** Una cel·la, desarmada i entre cometes si cal. */
export function cella(valor: string): string {
  const desarmat = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor
  return /[";\r\n]/.test(desarmat) || desarmat !== desarmat.trim()
    ? `"${desarmat.replace(/"/g, '""')}"`
    : desarmat
}

export function csvViatgers(files: readonly DadesViatger[]): string {
  const linies = files.map((f) =>
    [
      f.nom,
      f.cognom1,
      f.cognom2 ?? '',
      SEXE[f.sexe],
      DOCUMENT[f.tipus_document],
      f.numero_document,
      f.numero_suport ?? '',
      nomDelPais(f.nacionalitat, 'ca'),
      dataDMA(f.data_naixement),
      f.adreca,
      f.localitat,
      nomDelPais(f.pais, 'ca'),
      f.telefon_emergencia,
    ]
      .map(cella)
      .join(SEP),
  )
  return BOM + [CAPCALERES.map(cella).join(SEP), ...linies].join(EOL) + EOL
}
