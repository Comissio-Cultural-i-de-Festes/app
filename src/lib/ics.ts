import { brand } from '@/config/brand'

/**
 * Un esdeveniment cap al calendari del telèfon.
 *
 * PER QUÈ UN FITXER I NO UN ENLLAÇ A GOOGLE CALENDAR. Un enllaç
 * `calendar.google.com/render?...` obre el navegador, demana iniciar sessió si
 * no hi és, i només serveix a qui faci servir Google Calendar. Un `.ics` amb
 * `text/calendar` l'obren el calendari natiu d'iOS i el d'Android, i també
 * Outlook: és el format que tots entenen i no depèn de cap compte.
 *
 * L'UID ÉS EL QUE FA QUE TORNAR-HI SIGUI INOFENSIU. `UID` és la identitat de
 * l'entrada per al calendari: amb el mateix UID, afegir-la un altre cop
 * *actualitza* la que hi ha en comptes de crear-ne una segona. Això és el que
 * fa que la fila «Torna-hi» de la pantalla no sigui perillosa, i és també el
 * que arregla el cas de debò: la junta canvia l'hora, la gent hi torna, i el
 * calendari es corregeix sol. Amb un UID aleatori, canviar l'hora voldria dir
 * dues entrades a la mateixa nit i ningú no sabria quina val.
 *
 * `SEQUENCE` acompanya l'UID. Un calendari té dret a ignorar una actualització
 * amb la mateixa seqüència que la que ja té, i per tant la data de modificació
 * sola no sempre n'hi ha prou; es fa servir el temps en minuts des de l'època,
 * que puja sol i cap en un enter.
 *
 * TOT EN UTC. `DTSTART:20261114T210000Z` no necessita cap `VTIMEZONE`, que és
 * la meitat d'un fitxer ICS ben fet i la font de la meitat dels seus errors.
 * L'hora que hi va és la que la base guarda, que ja és un instant absolut.
 *
 * I ELS SALTS DE LÍNIA SÓN CRLF, no `\n`. L'RFC 5545 ho demana i el calendari
 * d'iOS és el que se'n queixa: un fitxer amb `\n` s'obre buit i sense dir per
 * què.
 */

/** Sense hora de final, quant dura. */
export const DEFAULT_DURATION_MS = 6 * 60 * 60 * 1000

export interface CalendarEvent {
  readonly id: string
  readonly titol: string
  readonly startsAt: string
  readonly endsAt: string | null
  readonly ubicacio: string | null
  readonly descripcio: string | null
}

/** `20261114T210000Z` */
function stamp(date: Date): string {
  return `${date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')}`
}

/**
 * Escapa el que l'RFC 5545 demana, i en aquest ordre.
 *
 * La barra invertida primer: fer-ho al final tornaria a escapar les que
 * acabem d'introduir i «Nau 3, Polígon» sortiria com «Nau 3\\, Polígon».
 */
function escape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Talla les línies a 75 octets, que és el que l'RFC demana.
 *
 * Es compta en octets i no en caràcters: una descripció en català arriba al
 * límit abans del que sembla, i un tall pel mig d'un caràcter multibyte deixa
 * el fitxer il·legible. Cada continuació comença amb un espai.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line

  const out: string[] = []
  let start = 0
  while (start < bytes.length) {
    // 75 la primera línia, 74 les següents: l'espai de continuació compta.
    let end = Math.min(start + (out.length === 0 ? 75 : 74), bytes.length)
    // Enrere fins al començament d'un caràcter, que als bytes de continuació
    // d'UTF-8 són els que fan `10xxxxxx`.
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--
    out.push(new TextDecoder().decode(bytes.slice(start, end)))
    start = end
  }
  return out.join('\r\n ')
}

function vevent(event: CalendarEvent, origin: string, now: Date): string[] {
  const starts = new Date(event.startsAt)
  const ends =
    event.endsAt === null
      ? new Date(starts.getTime() + DEFAULT_DURATION_MS)
      : new Date(event.endsAt)

  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id}@comi`,
    `DTSTAMP:${stamp(now)}`,
    // Els minuts des de l'època: puja sol i cap en un enter, o sigui que una
    // versió posterior del mateix esdeveniment sempre guanya.
    `SEQUENCE:${String(Math.floor(now.getTime() / 60_000))}`,
    `DTSTART:${stamp(starts)}`,
    `DTEND:${stamp(ends)}`,
    `SUMMARY:${escape(event.titol)}`,
    `URL:${origin}/esdeveniment/${event.id}`,
  ]

  if (event.ubicacio !== null && event.ubicacio.trim() !== '') {
    lines.push(`LOCATION:${escape(event.ubicacio)}`)
  }
  // La descripció acaba amb l'enllaç: molts calendaris ensenyen el cos i no el
  // camp URL, i tocar l'enllaç és com es torna a l'app des del calendari.
  const description = [event.descripcio, `${origin}/esdeveniment/${event.id}`]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .join('\n')
  lines.push(`DESCRIPTION:${escape(description)}`)

  lines.push('END:VEVENT')
  return lines
}

/**
 * El fitxer sencer, per a un esdeveniment o per a tots de cop.
 *
 * `PRODID` porta el nom de l'associació i no cap marca de cap eina: és el que
 * alguns calendaris ensenyen com a origen de l'entrada.
 */
export function buildIcs(
  events: readonly CalendarEvent[],
  origin: string,
  now: Date = new Date(),
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${escape(brand.shortName)}//app//CA`,
    'CALSCALE:GREGORIAN',
    // `PUBLISH` i no `REQUEST`: això no és una invitació que espera resposta
    // —el sí/potser/no viu a l'app— sinó una entrada que es posa al calendari.
    // Amb `REQUEST`, Outlook hi posaria botons d'acceptar i declinar que no
    // arribarien enlloc.
    'METHOD:PUBLISH',
    ...events.flatMap((event) => vevent(event, origin, now)),
    'END:VCALENDAR',
  ]

  // L'RFC vol CRLF i el fitxer ha d'acabar amb un.
  return `${lines.map(fold).join('\r\n')}\r\n`
}

/** Un nom que algú veurà a la carpeta de descàrregues. */
export function icsFilename(titol: string): string {
  const slug = titol
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug === '' ? 'esdeveniment' : slug}.ics`
}
