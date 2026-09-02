import { unwrapAs } from '@/lib/db'
import type { Abast } from '@/lib/model'
import { supabase } from '@/lib/supabase'

/**
 * Les reunions, per al panell de la junta.
 *
 * TOTES DUES MENES, i és el que la fa diferent de la llista de l'Inici: aquí
 * hi surten les de junta i les de comi, perquè totes dues les convoca i les
 * tanca la mateixa gent. Les de junta no arriben enlloc més —la política
 * `events_select_member` les filtra— i per tant aquest és l'únic lloc on es
 * veuen.
 *
 * PASSADES I FUTURES, i en ordre invers: el que fa falta primer és tancar la
 * que s'acaba de fer, no veure la del mes que ve. La llista comença per la més
 * recent i la que encara no s'ha tancat és la que porta l'acció.
 */

export interface MeetingRow {
  readonly id: string
  readonly titulo: string | null
  readonly starts_at: string
  readonly ubicacion: string | null
  readonly abast: Abast
  readonly tancada_at: string | null
  readonly acta: string | null
  readonly puntos: number
}

export const meetingListKeys = {
  list: () => ['junta', 'meetings'] as const,
}

const COLUMNS = 'id, titulo, starts_at, ubicacion, abast, tancada_at, acta, puntos'

export async function fetchMeetings(): Promise<MeetingRow[]> {
  return unwrapAs<MeetingRow[]>(
    supabase
      .from('events_public')
      .select(COLUMNS)
      .eq('tipo', 'reunio')
      .eq('published', true)
      // Un trimestre enrere: el que hi ha més amunt ja no es tanca —«es pot
      // tornar a obrir mentre no acabi el trimestre»— i una llista que creix
      // sola acaba sent inútil.
      .gte('starts_at', new Date(Date.now() - 120 * 86_400_000).toISOString())
      .order('starts_at', { ascending: false })
      .limit(20),
  )
}
