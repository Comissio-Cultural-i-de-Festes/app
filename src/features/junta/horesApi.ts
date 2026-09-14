import type { EventType } from '@/lib/model'
import { DbError, unwrapAs } from '@/lib/db'
import { rpc, supabase } from '@/lib/supabase'

/**
 * Les hores, vistes des de la junta.
 *
 * Només entrada i sortida de dades: tot el que decideix quantes hores ha fet
 * algú viu a `private.minuts_persona`, dins de la base, i aquí no se'n calcula
 * res. El que el client sap fer és demanar-ho i tornar-ho a demanar.
 *
 * Tres escriptures i no una amb tres banderes, perquè són tres decisions
 * diferents —quant val l'activitat, si està visada, i l'excepció d'una
 * persona—, es prenen des de llocs diferents i deixen tres línies diferents al
 * registre.
 */

/** Una persona dins de la pantalla d'hores d'una activitat. */
export interface HoresPersona {
  readonly user_id: string
  readonly nombre: string
  readonly avatar_url: string | null
  readonly checked_in_at: string | null
  readonly exit_photo_at: string | null
  /** Null quan només hi ha una de les dues marques i no se sap l'estona. */
  readonly minuts: number | null
  /** El que diria el càlcul sense l'excepció, per poder-ho ensenyar al costat. */
  readonly minuts_calcul: number | null
  readonly excepcio: boolean
}

/** El que torna `admin_hores_esdeveniment()`. */
export interface HoresEsdeveniment {
  readonly event_id: string
  readonly titol: string | null
  readonly tipo: EventType
  readonly starts_at: string
  readonly ends_at: string | null
  readonly minuts: number
  readonly a_la_uni: boolean
  /** Fals per a una casa rural, que no pot comptar mai. */
  readonly pot_ser_uni: boolean
  readonly visat_at: string | null
  readonly visat_per: string | null
  readonly persones: number
  readonly minuts_totals: number
  readonly gent: readonly HoresPersona[]
}

/** Una fila del resum del curs. */
export interface HoresSoci {
  readonly user_id: string
  readonly nombre: string
  readonly avatar_url: string | null
  readonly escola: string | null
  readonly curs: number | null
  readonly minuts: number
  readonly minuts_provisionals: number
  readonly quantes: number
}

/** Quanta feina queda abans de tancar la memòria. */
export interface HoresPendents {
  readonly activitats: number
  readonly minuts: number
}

export const horesKeys = {
  event: (eventId: string) => ['junta', 'hores', 'event', eventId] as const,
  socis: () => ['junta', 'hores', 'socis'] as const,
  pendents: () => ['junta', 'hores', 'pendents'] as const,
}

export async function fetchHoresEsdeveniment(eventId: string): Promise<HoresEsdeveniment> {
  const { data, error } = await supabase.rpc('admin_hores_esdeveniment', { p_event_id: eventId })
  if (error) throw new DbError(error)
  return data as unknown as HoresEsdeveniment
}

export async function fetchHoresSocis(): Promise<HoresSoci[]> {
  return unwrapAs<HoresSoci[]>(supabase.rpc('admin_hores_socis').select('*'))
}

export async function fetchHoresPendents(): Promise<HoresPendents> {
  const { data, error } = await supabase.rpc('admin_hores_pendents')
  if (error) throw new DbError(error)
  return data as unknown as HoresPendents
}

/**
 * Quant val l'activitat i si es fa a la uni.
 *
 * Les dues juntes perquè la tira del formulari les desa d'un sol cop: són un
 * sol fet sobre l'activitat. Desar-les treu el visat, que és cosa de la RPC.
 */
export async function setEventHores(
  eventId: string,
  minuts: number,
  aLaUni: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_hores', {
    p_event_id: eventId,
    p_minuts: minuts,
    p_a_la_uni: aLaUni,
  })
  if (error) throw new DbError(error)
}

export async function visaHores(eventId: string, visat: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_visa_hores', {
    p_event_id: eventId,
    p_visat: visat,
  })
  if (error) throw new DbError(error)
}

/**
 * L'excepció d'una persona. Amb `null` torna al que digui el càlcul.
 *
 * La RPC la refusa mentre l'activitat està visada: per tocar una hora signada
 * cal desfer el vist primer. La pantalla ja amaga el botó, i això és la segona
 * tanca.
 */
export async function setHoresPersona(
  eventId: string,
  userId: string,
  minuts: number | null,
): Promise<void> {
  // Per `rpc()` i no per `supabase.rpc()`: el generador escriu `p_minuts` com a
  // `number` perquè no sap llegir la nul·labilitat d'un paràmetre, i aquí el NULL
  // és la manera de treure l'excepció. El cast viu al lloc que el repo té per a
  // això i no escampat per aquí.
  const { error } = await rpc<null>('admin_set_hores_persona', {
    p_event_id: eventId,
    p_user_id: userId,
    p_minuts: minuts,
  })
  if (error) throw new DbError(error)
}
