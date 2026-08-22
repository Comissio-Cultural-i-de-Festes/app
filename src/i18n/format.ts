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

/**
 * Monday. Hardcoded on purpose.
 *
 * Do not derive this from the locale: `en-GB` says Monday but `en-US` says
 * Sunday, and an Erasmus student who picked English still lives in the same
 * week as everyone else. The locale decides the words, not the calendar.
 */
export const WEEK_STARTS_ON = 1 as const

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

export const formatWeekdayShort = (d: Date, l: Locale): string =>
  dtf(l, { weekday: 'short' }).format(d)

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

export const formatNumber = (n: number, l: Locale): string =>
  new Intl.NumberFormat(INTL_LOCALE[l]).format(n)

/**
 * Start of the week containing `date`, in the association's time zone.
 *
 * Catalan and Spanish short month names are lowercase (`de gen.`, `d'abr.`).
 * Never `text-transform: capitalize` a formatted date.
 */
export function startOfWeek(date: Date): Date {
  const parts = dtf('en', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? ''

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dow = weekdays.indexOf(get('weekday'))
  const offset = (dow - WEEK_STARTS_ON + 7) % 7

  // Midnight UTC on the local calendar date, then step back to Monday. Working
  // from the zone-formatted date rather than the Date's own getters is what
  // keeps this correct for a member using the app from abroad.
  const local = Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')))
  return new Date(local - offset * 86_400_000)
}
