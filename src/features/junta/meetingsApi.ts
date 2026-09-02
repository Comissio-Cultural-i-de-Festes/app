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
 * PASSADES I FUTURES, i ordenades per feina i no per data. Ordenar-les per
 * data cap enrere sembla que fa el que cal —«primer la que s'acaba de fer»—
 * però amb tres reunions convocades i cap feta, el que surt a dalt és la del
 * mes que ve, que és justament la que no demana res. L'ordre és aquest:
 *
 *   1. les que ja s'han fet i ningú ha tancat, la més recent a dalt;
 *   2. les convocades, la més propera primer;
 *   3. les tancades, la més recent primer, que és on es va a llegir l'acta.
 *
 * Això és ordre de presentació i es fa aquí i no a Postgres: PostgREST no sap
 * ordenar per una expressió, i la regla que diu que filtra la base parla de
 * qui pot veure què. Aquestes files ja són totes seves.
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

/** Quina reunió demana alguna cosa, i en quin ordre. Vegeu el bloc de dalt. */
export function byWhatNeedsYou(rows: readonly MeetingRow[], now = Date.now()): MeetingRow[] {
  const rank = (m: MeetingRow) => {
    if (m.tancada_at !== null) return 2
    return new Date(m.starts_at).getTime() <= now ? 0 : 1
  }

  return [...rows].sort((a, b) => {
    const byRank = rank(a) - rank(b)
    if (byRank !== 0) return byRank
    const ta = new Date(a.starts_at).getTime()
    const tb = new Date(b.starts_at).getTime()
    // Les convocades van cap endavant —la de dilluns abans que la del mes que
    // ve—; les altres dues cap enrere, perquè el que es busca és l'última.
    return rank(a) === 1 ? ta - tb : tb - ta
  })
}

export async function fetchMeetings(): Promise<MeetingRow[]> {
  const rows = await unwrapAs<MeetingRow[]>(
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
  return byWhatNeedsYou(rows)
}
