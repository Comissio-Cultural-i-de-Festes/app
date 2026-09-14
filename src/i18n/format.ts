import { env } from '@/config/env'

import { INTL_LOCALE, type Locale } from './locales'

/**
 * Dates and numbers, always through Intl and never formatted by hand.
 *
 * Events are nocturnal, so everything is a `timestamptz` in UTC on the server
 * and gets formatted here in the association's zone. Formatting in the
 * device's zone would put a Saturday-night event on Sunday for anyone whose
 * phone is set elsewhere.
 */
export const APP_TIME_ZONE = env.timeZone

const dtfCache = new Map<string, Intl.DateTimeFormat>()

function dtf(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`
  const hit = dtfCache.get(key)
  if (hit) return hit
  const made = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: APP_TIME_ZONE,
    ...options,
  })
  dtfCache.set(key, made)
  return made
}

export const formatDayMonth = (d: Date, l: Locale): string =>
  dtf(l, { day: 'numeric', month: 'short' }).format(d)

export const formatTime = (d: Date, l: Locale): string =>
  dtf(l, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)

export const formatDateTime = (d: Date, l: Locale): string =>
  dtf(l, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d)

/**
 * "12è", "2a", "2.º", "12th".
 *
 * Not Intl: `Intl.PluralRules` with `type: 'ordinal'` gives you the category,
 * not the suffix, and there is no API that gives the suffix for Catalan at
 * all. The rules are short enough to write down.
 *
 * Gender matters in two of the three languages and is not optional there: the
 * school is feminine ("la Politècnica va 2a") and a person's position is
 * masculine ("vas 12è"), and getting it wrong is the kind of mistake that
 * makes an app read as translated rather than written.
 */
export function formatOrdinal(n: number, l: Locale, gender: 'm' | 'f' = 'm'): string {
  if (l === 'en') {
    const teens = n % 100
    if (teens >= 11 && teens <= 13) return `${String(n)}th`
    const last = n % 10
    return `${String(n)}${last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'}`
  }

  if (l === 'es') return `${String(n)}.${gender === 'f' ? 'ª' : 'º'}`

  // Catalan abbreviates the first four ordinals from their own words — primer,
  // segon, tercer, quart — and everything from cinquè on takes -è. The
  // feminine (primera, segona, cinquena) is always -a.
  if (gender === 'f') return `${String(n)}a`
  const special: Record<number, string> = { 1: 'r', 2: 'n', 3: 'r', 4: 't' }
  return `${String(n)}${special[n] ?? 'è'}`
}

/**
 * The long form, for the one place on a screen that spells the date out.
 *
 * Anywhere else this is too much: "divendres, 12 de setembre de 2026, 21:00"
 * is a sentence, and a sentence in an eyebrow stops being read.
 */
export const formatDateLong = (d: Date, l: Locale): string =>
  dtf(l, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d)

export const formatMonthShort = (d: Date, l: Locale): string => dtf(l, { month: 'short' }).format(d)

/**
 * El mes sencer, per a les insígnies: «Can Bravo · desembre».
 *
 * Sense any a posta. Una insígnia és d'una nit concreta i la nit ja té nom al
 * costat; l'any només caldria per distingir dos desembres, i quan això passi el
 * títol de l'activitat ja serà diferent.
 */
export const formatMonthLong = (d: Date, l: Locale): string => dtf(l, { month: 'long' }).format(d)

export const formatDayNumber = (d: Date, l: Locale): string => dtf(l, { day: 'numeric' }).format(d)

export const formatWeekdayLong = (d: Date, l: Locale): string =>
  dtf(l, { weekday: 'long' }).format(d)

/**
 * An index for `date`'s calendar day in the association's time zone.
 *
 * NOT AN INSTANT. It is midnight UTC on the local calendar date, which is two
 * hours adrift of the moment that day actually began in Madrid. Compare two of
 * these to each other — same day, or how many sleeps apart — and never against
 * a timestamp, or everything between midnight and 02:00 lands on the wrong
 * side of it.
 *
 * The arithmetic has to happen on calendar days rather than raw timestamps:
 * subtracting hours would call a party starting at 00:30 tonight "tomorrow",
 * and one at 23:00 "in 0 days".
 */
export function zonedDayStart(date: Date): number {
  const parts = dtf('en', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? ''
  return Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')))
}

const DAY_MS = 86_400_000

/** Whole days from today to `date`, in the association's time zone. */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.round((zonedDayStart(date) - zonedDayStart(now)) / DAY_MS)
}

const nfCache = new Map<Locale, Intl.NumberFormat>()

function nf(locale: Locale): Intl.NumberFormat {
  const hit = nfCache.get(locale)
  if (hit) return hit
  const made = new Intl.NumberFormat(INTL_LOCALE[locale])
  nfCache.set(locale, made)
  return made
}

/** Una durada partida en el número i el que va darrere: «13» + «h 15». */
export interface HoresParts {
  /** Les hores, o els minuts quan no arriba a una hora. */
  readonly xifra: string
  /** «h 15», «h», «min». */
  readonly unitat: string
}

/**
 * Una durada, en la forma que fa servir tota l'app: «2 h 30».
 *
 * UNA SOLA FORMA I NO TRES. No «2 h 30 min», que no cap a la dreta d'una fila;
 * i sobre tot no «2:30», que en aquesta app és una hora del dia —«21:00»— i es
 * llegiria com tal. És el que ja fa el compte enrere de l'esdeveniment amb
 * «6 d 4 h»: dues unitats i para.
 *
 * Els minuts van a dues xifres perquè una columna de durades quedi alineada
 * («4 h 05», no «4 h 5»), i per sota de l'hora només hi ha minuts: «45 min».
 * El zero és un valor conegut i s'escriu, «0 h», que és el que la targeta del
 * perfil ensenya a qui encara no n'ha fet cap.
 *
 * Ve partida en dos perquè les xifres grans de l'app les pinten amb el número
 * a un graó del display i la unitat dos graons més avall, i una sola cadena no
 * es pot partir sense tornar a parsejar-la.
 */
export function horesParts(minuts: number, l: Locale): HoresParts {
  const total = Math.max(0, Math.round(minuts))
  if (total > 0 && total < 60) return { xifra: nf(l).format(total), unitat: 'min' }

  const hores = Math.floor(total / 60)
  const resta = total % 60
  return {
    xifra: nf(l).format(hores),
    unitat: resta === 0 ? 'h' : `h ${String(resta).padStart(2, '0')}`,
  }
}

/** El mateix, en una sola cadena. */
export function formatHores(minuts: number, l: Locale): string {
  const { xifra, unitat } = horesParts(minuts, l)
  return `${xifra} ${unitat}`
}
