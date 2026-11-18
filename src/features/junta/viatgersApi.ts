import { DbError, unwrapAs } from '@/lib/db'
import type { AttendanceState } from '@/lib/model'
import { supabase } from '@/lib/supabase'

import type { DadesViatger } from './viatgersCsv'

/**
 * Les dades de viatger, des de la junta.
 *
 * TRES RPC I CAP `select`. La junta no té cap política sobre `dades_viatger`
 * (migració 90): la llista de qui les ha posat no porta cap dada del registre,
 * i les dades només surten per `admin_dades_viatgers`, que escriu a `audit_log`
 * qui les ha obert, quan i de qui.
 *
 * LES DADES NO VAN A LA CAU DE REACT QUERY. Es demanen amb una mutació, quan
 * algú prem el botó, i viuen a l'estat de la pantalla: en sortir-ne se'n van.
 * Una consulta les deixaria trenta minuts a la memòria i les tornaria a
 * demanar —i a auditar— cada cop que la finestra recupera el focus.
 */

export const viatgersKeys = {
  llista: (eventId: string) => ['junta', 'viatgers', eventId] as const,
}

export interface Apuntat {
  readonly user_id: string
  readonly nombre: string
  readonly estado: AttendanceState
  readonly te_dades: boolean
  readonly actualitzat_at: string | null
}

export async function fetchApuntats(eventId: string): Promise<Apuntat[]> {
  return unwrapAs<Apuntat[]>(supabase.rpc('admin_viatgers', { p_event_id: eventId }))
}

/** Torna quantes dades s'han esborrat: zero en marcar-la, les que hi havia en treure-la. */
export async function setDemana(eventId: string, demana: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('admin_set_demana_viatger', {
    p_event_id: eventId,
    p_demana: demana,
  })
  if (error) throw new DbError(error)
  return data
}

export type DadesAmbQui = DadesViatger & { readonly user_id: string }

/**
 * Les dades de qui té plaça. Cada crida és una fila al registre, i `exporta`
 * diu al registre si era per mirar-les o per treure'n el fitxer.
 */
export async function fetchDades(eventId: string, exporta: boolean): Promise<DadesAmbQui[]> {
  return unwrapAs<DadesAmbQui[]>(
    supabase.rpc('admin_dades_viatgers', { p_event_id: eventId, p_exporta: exporta }),
  )
}
