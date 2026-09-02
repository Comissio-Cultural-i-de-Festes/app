import { DbError, unwrapAs } from '@/lib/db'
import type { EventRow } from '@/lib/schema'
import { supabase } from '@/lib/supabase'

/**
 * One event, in full.
 *
 * Same columns as the home screen's list, because it is the same view and the
 * same reveal rules: the detail columns are absent rather than blank until
 * reveal_at, and `revelat` is what says which it is.
 */

const EVENT_COLUMNS =
  'id, titulo, tipo, starts_at, teaser, reveal_at, revelat, plazas, ' +
  'precio_cents, puntos, published, cal_confirmacio, te_cotxes, descripcion, ubicacion, ' +
  'ends_at, cover_url, transport_info'

export const eventKeys = {
  one: (id: string) => ['event', id] as const,
  waitlist: (id: string) => ['event', id, 'waitlist'] as const,
  interest: (id: string) => ['event', id, 'interest'] as const,
}

export async function fetchEvent(id: string): Promise<EventRow | null> {
  const rows = await unwrapAs<EventRow[]>(
    supabase.from('events_public').select(EVENT_COLUMNS).eq('id', id).limit(1),
  )
  return rows[0] ?? null
}

export interface WaitlistStatus {
  readonly posicio: number | null
  readonly total: number
}

/**
 * Where you are in the queue, and how long it is.
 *
 * Two definer functions rather than a read of the table: working out that you
 * are fourth means counting three rows belonging to other people, and a member
 * cannot read those. They come back as numbers and nothing else — no names, no
 * hint of who is ahead.
 */
export async function fetchWaitlist(eventId: string): Promise<WaitlistStatus> {
  const [position, size] = await Promise.all([
    supabase.rpc('waitlist_position', { p_event_id: eventId }),
    supabase.rpc('waitlist_size', { p_event_id: eventId }),
  ])

  // `?? null` and `?? 0` would have turned both failures into facts: no
  // position means "you are on the list somewhere" and a size of zero means
  // "nobody is waiting". Neither is something we know.
  if (position.error) throw new DbError(position.error)
  if (size.error) throw new DbError(size.error)

  return {
    posicio: position.data ?? null,
    total: size.data ?? 0,
  }
}

/** Cents to something a person reads. Free is free, not "0,00 €". */
export function formatPrice(cents: number, locale: string): string | null {
  if (cents <= 0) return null
  return formatMoney(cents, locale)
}

/**
 * The same, for an amount that is a total rather than a price.
 *
 * Zero is a real answer here — nobody has paid yet — where on an event it
 * means the thing is free, which is why the two are separate functions.
 */
export function formatMoney(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)
}

export interface Interest {
  /** Si aquesta persona ja ha premut «Avisa'm». */
  readonly vol: boolean
  readonly quants: number
}

/**
 * Qui està pendent de la revelació, en dues xifres i cap nom.
 *
 * Dues funcions definer i no una lectura de `event_interest`: el nombre és
 * públic —és el que fa que la pantalla del teaser funcioni— i qui són no ho és.
 * `authenticated` no té SELECT sobre la taula, i per tant «no hi ha ningú» i
 * «no ho puc saber» no es poden confondre: si la petició falla, falla.
 */
export async function fetchInterest(eventId: string): Promise<Interest> {
  const [mine, size] = await Promise.all([
    supabase.rpc('my_event_interest', { p_event_id: eventId }),
    supabase.rpc('event_interest_size', { p_event_id: eventId }),
  ])

  // Ni `?? false` ni `?? 0`: convertirien una petició fallida en un fet —«no
  // l'has premut» i «no hi ha ningú esperant»— i el botó es dibuixaria com si
  // no s'hagués premut mai.
  if (mine.error) throw new DbError(mine.error)
  if (size.error) throw new DbError(size.error)

  return { vol: mine.data ?? false, quants: size.data ?? 0 }
}

/**
 * Prem o desprem el botó.
 *
 * Una RPC i no un insert/delete segons l'estat: el client no ha de saber en
 * quin dels dos està per decidir quina operació fa, i la resposta ja porta el
 * recompte nou —demanar-lo després seria una segona petició que pot arribar
 * abans.
 */
export async function setInterest(eventId: string, vol: boolean): Promise<Interest> {
  const { data, error } = await supabase.rpc('set_event_interest', {
    p_event_id: eventId,
    p_vol: vol,
  })
  if (error) throw new DbError(error)
  return data as unknown as Interest
}
