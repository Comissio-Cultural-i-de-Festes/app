import { DbError } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * What the rebedor knows before it draws anything.
 *
 * One call rather than six, so the screen has one loading state and one thing
 * that can fail. Which parts are allowed to wait is a design decision the
 * prototype states out loud: the door panel and the numbers, never the
 * navigation rows.
 */

export interface DoorNow {
  readonly id: string
  readonly titulo: string
  readonly starts_at: string
  readonly ubicacion: string | null
  readonly plazas: number | null
  readonly de_pagament: boolean
  readonly diuen_si: number
  readonly fitxats: number
  /** Waiting for a place and waiting for a decision, added together. */
  readonly esperen: number
  readonly no_pagats: number
}

export interface JuntaHomeData {
  readonly porta: DoorNow | null
  readonly pendents: number
  readonly esborranys: number
  readonly propers: number
  readonly socis: number
}

export const juntaHomeKeys = {
  home: () => ['junta', 'home'] as const,
}

export async function fetchJuntaHome(): Promise<JuntaHomeData> {
  const { data, error } = await supabase.rpc('junta_home')
  if (error) throw new DbError(error)
  return data as unknown as JuntaHomeData
}

/** How many free places, or null when the event has no cap. */
export function placesLeft(porta: DoorNow): number | null {
  return porta.plazas === null ? null : Math.max(0, porta.plazas - porta.diuen_si)
}
