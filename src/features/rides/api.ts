import { DbError, unwrapAs } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * Getting there, when there is no train.
 *
 * `places` is the number of seats offered to other people — the driver is not
 * one of them. The drawing shows `places + 1` on the car, because that is what
 * a car holds; the number in the form is what somebody is giving away.
 *
 * Seats are read straight from `ride_seats`, whose policy publishes them to any
 * member once the event is revealed: who is going with whom is the whole point.
 * Taking one goes through `join_ride`, which is the only way in — the room
 * check has to happen inside the same lock as the write.
 */

export type Sentit = 'anada' | 'tornada' | 'anada_tornada'

export interface Seat {
  readonly user_id: string
  readonly created_at: string
  /** `convidat` is held for somebody who has not said yes yet. */
  readonly estat: 'convidat' | 'a_dins'
  readonly profiles: { readonly nombre: string; readonly avatar_url: string | null } | null
}

export interface Ride {
  readonly id: string
  readonly event_id: string
  readonly driver_id: string
  readonly sentit: Sentit
  readonly origen: string
  readonly hora_sortida: string | null
  readonly places: number
  readonly notes: string | null
  readonly created_at: string
  readonly driver: { readonly nombre: string; readonly avatar_url: string | null } | null
  readonly seats: readonly Seat[]
}

export const rideKeys = {
  list: (eventId: string) => ['rides', eventId] as const,
  phones: (rideId: string) => ['rides', 'phones', rideId] as const,
  candidates: (rideId: string) => ['rides', 'candidates', rideId] as const,
}

const COLUMNS =
  'id, event_id, driver_id, sentit, origen, hora_sortida, places, notes, created_at, ' +
  'driver:profiles!rides_driver_id_fkey(nombre, avatar_url), ' +
  // Two levels deep, with the foreign key named. Verified against PostgREST
  // rather than assumed: the alternative was a second query per car.
  'seats:ride_seats(user_id, created_at, estat, profiles!ride_seats_user_id_fkey(nombre, avatar_url))'

export async function fetchRides(eventId: string): Promise<Ride[]> {
  return unwrapAs<Ride[]>(
    supabase
      .from('rides')
      .select(COLUMNS)
      .eq('event_id', eventId)
      .order('hora_sortida', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
  )
}

/** What taking a seat came back as. None of these is a fault in the request. */
export type JoinResult =
  | 'a_dins'
  | 'sense_places'
  | 'ets_el_conductor'
  | 'ja_hi_ets'
  | 'altre_cotxe'
  | 'no_hi_es'

export async function joinRide(rideId: string): Promise<JoinResult> {
  const { data, error } = await supabase.rpc('join_ride', { p_ride_id: rideId })
  if (error) throw new DbError(error)
  return (data as unknown as { estat: JoinResult }).estat
}

export async function leaveRide(rideId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('ride_seats')
    .delete()
    .eq('ride_id', rideId)
    .eq('user_id', userId)
  if (error) throw new DbError(error)
}

export async function offerRide(ride: {
  readonly eventId: string
  readonly driverId: string
  readonly sentit: Sentit
  readonly origen: string
  readonly places: number
  readonly horaSortida: string | null
  readonly notes: string | null
}): Promise<void> {
  const { error } = await supabase.from('rides').insert({
    event_id: ride.eventId,
    driver_id: ride.driverId,
    sentit: ride.sentit,
    origen: ride.origen.trim(),
    places: ride.places,
    hora_sortida: ride.horaSortida,
    notes: ride.notes,
  })
  if (error) throw new DbError(error)
}

/** Taking the car back. The passengers lose their seats, so it is said out loud. */
export async function withdrawRide(rideId: string): Promise<void> {
  const { error } = await supabase.from('rides').delete().eq('id', rideId)
  if (error) throw new DbError(error)
}

export interface Phone {
  readonly user_id: string
  readonly nombre: string
  readonly telefon: string | null
}

/**
 * The passengers' numbers, and only for their driver.
 *
 * Comes back empty for anybody else — the function decides, not this call — so
 * an empty list here means "not yours to see" or "nobody has joined", and the
 * screen only ever asks for a car it already knows is the caller's.
 */
export async function fetchPhones(rideId: string): Promise<Phone[]> {
  return unwrapAs<Phone[]>(supabase.rpc('ride_phones', { p_ride_id: rideId }).select('*'))
}

/** Who a driver could hold a seat for: active, not themselves, not already going. */
export interface Candidate {
  readonly user_id: string
  readonly nombre: string
  readonly avatar_url: string | null
}

export async function fetchCandidates(rideId: string): Promise<Candidate[]> {
  return unwrapAs<Candidate[]>(supabase.rpc('ride_candidates', { p_ride_id: rideId }).select('*'))
}

/** What holding a seat came back as. Same vocabulary as taking one. */
export type InviteResult = JoinResult | 'convidat'

export async function inviteToRide(rideId: string, userId: string): Promise<InviteResult> {
  const { data, error } = await supabase.rpc('invite_to_ride', {
    p_ride_id: rideId,
    p_user_id: userId,
  })
  if (error) throw new DbError(error)
  return (data as unknown as { estat: InviteResult }).estat
}
