import { type CalendarEvent, buildIcs, icsFilename } from '@/lib/ics'

/**
 * Posar un esdeveniment al calendari del telèfon, i recordar que s'ha fet.
 *
 * DUES COSES QUE NO ES PODEN SABER, i tota la pantalla surt d'elles.
 *
 * La primera: **l'app no pot llegir el calendari del telèfon.** No hi ha cap
 * API que ho deixi fer des d'una pàgina web, i per tant no hi ha manera de
 * saber si l'entrada encara hi és. El que es guarda aquí no és «és al
 * calendari» sinó «des d'aquest navegador es va baixar el fitxer», que és una
 * cosa diferent i més modesta. Per això la fila diu el que sap i deixa
 * tornar-hi, en comptes de pintar un ✓ i prou.
 *
 * La segona: **no es pot saber si el fitxer s'ha obert.** Un `.ics` que va a
 * la carpeta de descàrregues i ningú no toca no ha arribat a cap calendari.
 * Per això «Torna-hi» no és una recaiguda del disseny: és l'única sortida
 * honesta, i és inofensiva perquè l'UID és estable —tornar-hi actualitza
 * l'entrada en comptes de duplicar-la.
 *
 * PER NAVEGADOR I NO PER PERSONA. `localStorage`, o sigui que qui afegeixi la
 * festa al mòbil i després obri l'app al portàtil hi tornarà a veure la
 * proposta. És correcte: el calendari on va l'entrada és el del telèfon, i el
 * portàtil no en sap res.
 *
 * I ES DESA ABANS DE BAIXAR-LO. Si l'ordre fos l'altre i l'escriptura fallés
 * —Safari en privat llança en escriure— la persona tindria el fitxer i la
 * pantalla seguiria oferint-l'hi. Al revés, el pitjor cas és una marca d'una
 * descàrrega que no ha passat, i la fila ja convida a tornar-hi.
 */

const ADDED_KEY = 'comi.calendar.added'
const DECLINED_KEY = 'comi.calendar.declined'

function read(key: string): readonly string[] {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    // Safari en privat llança en llegir, i un JSON que algú hagi tocat a mà
    // no ha de deixar la pantalla sense pintar.
    return []
  }
}

function add(key: string, eventId: string): void {
  try {
    const next = [...new Set([...read(key), eventId])].slice(-200)
    localStorage.setItem(key, JSON.stringify(next))
  } catch {
    /* Una comoditat. Si no es pot desar, el botó encara funciona. */
  }
}

/** Si des d'aquest navegador ja s'ha baixat el fitxer d'aquest esdeveniment. */
export function wasAdded(eventId: string): boolean {
  return read(ADDED_KEY).includes(eventId)
}

/** I si s'ha dit «no, gràcies» a la proposta, que la fa desaparèixer per sempre. */
export function wasDeclined(eventId: string): boolean {
  return read(DECLINED_KEY).includes(eventId)
}

export function markAdded(eventId: string): void {
  add(ADDED_KEY, eventId)
}

export function markDeclined(eventId: string): void {
  add(DECLINED_KEY, eventId)
}

/**
 * Baixa el fitxer.
 *
 * `download` i no `navigator.share`: compartir un `.ics` obre el full del
 * sistema i el que la gent hi tria és Missatges o WhatsApp, no el calendari.
 * Una descàrrega d'un `text/calendar` la intercepta el calendari natiu a totes
 * dues plataformes, que és el que es vol.
 *
 * L'anchor mai es queda al document i l'URL es revoca a la següent tasca:
 * revocar-la a la mateixa cancel·la la descàrrega a WebKit. Igual que
 * `lib/share.ts`, que ja va passar per això.
 */
export function downloadIcs(events: readonly CalendarEvent[], filename?: string): boolean {
  if (events.length === 0) return false

  try {
    const ics = buildIcs(events, window.location.origin)
    // El BOM no hi va: l'RFC vol UTF-8 sense marca, i el calendari d'Android
    // ensenya el BOM com a part del primer camp.
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename ?? icsFilename(events[0]?.titol ?? '')
    anchor.rel = 'noopener'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 10_000)

    return true
  } catch {
    return false
  }
}
