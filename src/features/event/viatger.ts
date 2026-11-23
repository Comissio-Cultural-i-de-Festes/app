import { endOfEvent } from '@/lib/eventEnd'
import type { AttendanceState } from '@/lib/model'

/**
 * Les dades del registre de viatgers, abans d'arribar a la base.
 *
 * LES MATEIXES REGLES QUE ELS CHECK DE LA MIGRACIÓ 90, escrites aquí perquè la
 * persona sàpiga quin camp no val abans d'enviar-lo, i no després amb un error
 * genèric. La base és qui mana: si aquestes dues còpies es desfessin, el pitjor
 * que passa és un «no ha sortit bé» on hauria d'haver sortit la frase del camp.
 *
 * NORMALITZAR NO ÉS VALIDAR. El número de document arriba amb espais, guions i
 * en minúscula —«1234-5678 z»—, i això no és un error de qui l'escriu: és com
 * el porta escrit a la cartera. Es treu tot el que sobra i es valida el que
 * queda. El que no es fa és corregir: una lletra de control que no quadra és un
 * dígit mal copiat, i qui sap quin és és la persona, no l'app.
 */

/** Set dies després del final de l'estada. La migració 90 en diu el mateix. */
export const RETENCIO_DIES = 7

export const TIPUS_DOCUMENT = ['dni', 'nie', 'passaport', 'id_ue'] as const
export type TipusDocument = (typeof TIPUS_DOCUMENT)[number]

export const SEXES = ['dona', 'home', 'altre'] as const
export type Sexe = (typeof SEXES)[number]

export const MAX_NOM = 80
export const MAX_ADRECA = 160
export const MAX_LOCALITAT = 80

/** El que la persona escriu al formulari, tal com ho escriu. */
export interface EsborranyViatger {
  readonly nom: string
  readonly cognom1: string
  readonly cognom2: string
  readonly sexe: Sexe | ''
  readonly tipus_document: TipusDocument | ''
  readonly numero_document: string
  readonly numero_suport: string
  readonly nacionalitat: string
  /** `YYYY-MM-DD`, el valor d'un `<input type="date">`. */
  readonly data_naixement: string
  readonly adreca: string
  readonly localitat: string
  readonly pais: string
  readonly telefon_emergencia: string
}

/** El que la base rep: net, normalitzat i amb `null` on no hi ha res. */
export interface FilaViatger {
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

export type CampViatger = keyof EsborranyViatger

export const BUIT: EsborranyViatger = {
  nom: '',
  cognom1: '',
  cognom2: '',
  sexe: '',
  tipus_document: '',
  numero_document: '',
  numero_suport: '',
  nacionalitat: '',
  data_naixement: '',
  adreca: '',
  localitat: '',
  pais: '',
  telefon_emergencia: '',
}

/**
 * Els blancs dels extrems, tots: els que `trim()` ja treu i l'espai d'amplada
 * zero, que no hi entra. És la mateixa llista que `private.nota_neta` (la 77),
 * i si en quedés un, la base refusaria el camp per brut.
 *
 * Al mig, una tirada de blancs es queda en un espai: «Carrer  Major» amb dos és
 * un dit que ha tocat l'espai dos cops, no una adreça diferent. I els caràcters
 * de control se'n van: la base no en vol cap, i al full de càlcul un salt de
 * línia dins d'una cel·la és una fila que es parteix en dues.
 */
export function netejaText(text: string): string {
  return text
    .replace(/[\s\u200B]+/g, ' ')
    .replace(/\p{Cc}/gu, '')
    .replace(/^ | $/g, '')
}

/** Majúscules, sense espais, guions ni punts: «1234-5678 z» → «12345678Z». */
export function normalitzaDocument(text: string): string {
  return text.toUpperCase().replace(/[\s.\-/]/g, '')
}

/**
 * Només dígits, amb el `+` del davant si n'hi havia: «+34 955-00 00 01» →
 * «+34955000001». El prefix escrit amb `00` també passa a `+`: «0034…» al full
 * de càlcul de la junta és un número, i l'Excel se'n menja els dos zeros.
 */
export function normalitzaTelefon(text: string): string {
  const net = text.trim()
  const digits = net.replace(/\D/g, '')
  if (net.startsWith('+')) return `+${digits}`
  return digits.startsWith('00') ? `+${digits.slice(2)}` : digits
}

const LLETRES = 'TRWAGMYFPDXBNJZSQVHLCKE'

function lletraBona(numero: string): boolean {
  return LLETRES[Number(numero.slice(0, -1)) % 23] === numero.slice(-1)
}

/**
 * Si el número és plausible per al tipus: la lletra de control del DNI i del
 * NIE, i un passaport o un document d'identitat de la UE alfanumèrics (cada
 * país numera els seus com vol, i només el DNI té una lletra que es pugui
 * comprovar). Espera el número ja normalitzat.
 */
export function numeroDocumentValid(tipus: TipusDocument, numero: string): boolean {
  if (tipus === 'dni') return /^[0-9]{8}[A-Z]$/.test(numero) && lletraBona(numero)
  if (tipus === 'nie') {
    if (!/^[XYZ][0-9]{7}[A-Z]$/.test(numero)) return false
    return lletraBona(String('XYZ'.indexOf(numero.charAt(0))) + numero.slice(1))
  }
  return /^[A-Z0-9]{3,20}$/.test(numero)
}

/** El passaport i el document d'identitat de la UE no en porten; el DNI i el NIE sí, i és el que el registre demana. */
export function portaSuport(tipus: TipusDocument | ''): boolean {
  return tipus === 'dni' || tipus === 'nie'
}

const SUPORT = /^[A-Z0-9]{6,20}$/
const TELEFON = /^\+?[0-9]{9,15}$/
const PAIS = /^[A-Z]{2}$/
const DATA = /^\d{4}-\d{2}-\d{2}$/

export type Lectura =
  | { readonly ok: true; readonly fila: FilaViatger }
  | { readonly ok: false; readonly problemes: ReadonlySet<CampViatger> }

/**
 * El formulari, llegit: o una fila que la base acceptarà, o la llista de
 * camps que no valen.
 *
 * `avui` és el dia d'avui en `YYYY-MM-DD` i ve de fora perquè la comparació no
 * depengui del rellotge del moment de la prova. Les dates d'un
 * `<input type="date">` es comparen bé com a text: tenen format fix.
 */
export function llegeixViatger(e: EsborranyViatger, avui: string): Lectura {
  const problemes = new Set<CampViatger>()

  const nom = netejaText(e.nom)
  const cognom1 = netejaText(e.cognom1)
  const cognom2 = netejaText(e.cognom2)
  const adreca = netejaText(e.adreca)
  const localitat = netejaText(e.localitat)
  const numero = normalitzaDocument(e.numero_document)
  const suport = normalitzaDocument(e.numero_suport)
  const telefon = normalitzaTelefon(e.telefon_emergencia)

  if (nom === '' || nom.length > MAX_NOM) problemes.add('nom')
  if (cognom1 === '' || cognom1.length > MAX_NOM) problemes.add('cognom1')
  if (cognom2.length > MAX_NOM) problemes.add('cognom2')
  if (e.sexe === '') problemes.add('sexe')
  if (e.tipus_document === '') {
    problemes.add('tipus_document')
  } else {
    if (!numeroDocumentValid(e.tipus_document, numero)) problemes.add('numero_document')
    if (portaSuport(e.tipus_document) && !SUPORT.test(suport)) problemes.add('numero_suport')
  }
  if (!PAIS.test(e.nacionalitat)) problemes.add('nacionalitat')
  if (!DATA.test(e.data_naixement) || e.data_naixement < '1900-01-01' || e.data_naixement > avui) {
    problemes.add('data_naixement')
  }
  if (adreca === '' || adreca.length > MAX_ADRECA) problemes.add('adreca')
  if (localitat === '' || localitat.length > MAX_LOCALITAT) problemes.add('localitat')
  if (!PAIS.test(e.pais)) problemes.add('pais')
  if (!TELEFON.test(telefon)) problemes.add('telefon_emergencia')

  if (problemes.size > 0 || e.sexe === '' || e.tipus_document === '') {
    return { ok: false, problemes }
  }

  return {
    ok: true,
    fila: {
      nom,
      cognom1,
      cognom2: cognom2 === '' ? null : cognom2,
      sexe: e.sexe,
      tipus_document: e.tipus_document,
      numero_document: numero,
      numero_suport: portaSuport(e.tipus_document) ? suport : null,
      nacionalitat: e.nacionalitat,
      data_naixement: e.data_naixement,
      adreca,
      localitat,
      pais: e.pais,
      telefon_emergencia: telefon,
    },
  }
}

/** Una fila desada, de tornada al formulari per editar-la. */
export function esborranyDe(fila: FilaViatger): EsborranyViatger {
  return {
    ...fila,
    cognom2: fila.cognom2 ?? '',
    numero_suport: fila.numero_suport ?? '',
  }
}

/**
 * Qui hi va, per al registre. La mateixa llista que `private.esta_apuntat`:
 * qui té plaça, qui espera, qui l'ha demanada i qui ja és dins.
 */
export function esApuntat(estado: AttendanceState | null): boolean {
  return estado === 'si' || estado === 'espera' || estado === 'sollicitat' || estado === 'asistio'
}

/**
 * Quan s'esborren: set dies després del final de l'estada, amb la regla de
 * final de `eventEnd.ts`, que és la que també fa servir la base.
 */
export function esborrenEl(startsAt: string, endsAt: string | null): Date {
  return new Date(endOfEvent(startsAt, endsAt) + RETENCIO_DIES * 24 * 3_600_000)
}
