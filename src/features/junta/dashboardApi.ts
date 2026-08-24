import type { Bounds } from '@/features/ranking/api'
import { DbError } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * El tauler, en una resposta.
 *
 * Cinc peticions serien cinc estats de càrrega i cinc coses que poden fallar en
 * una pantalla que es mira una vegada al mes. Mateix criteri que `junta_home()`.
 *
 * Cap taula nova al darrere: tot són consultes sobre fitxatges, punts, perfils
 * i períodes. La fase 3 existeix per fer tornar la gent al gener, i el que fa
 * falta per decidir-ho ja fa tres mesos que s'està desant.
 */

export interface Drifting {
  readonly id: string
  readonly nom: string
  readonly escola: string | null
  readonly curs: number | null
  readonly telefon: string | null
  readonly hi_va_anar: number
  readonly comptaven: number
  readonly ultima: string | null
  readonly ultima_at: string | null
}

export interface AttendancePoint {
  readonly id: string
  readonly titulo: string
  readonly starts_at: string
  readonly tipo: string
  readonly quants: number
}

export interface TypeRow {
  readonly tipo: string
  readonly quantes: number
  readonly mitjana: number
  readonly sempre_plena: boolean
}

export interface SchoolRow {
  readonly escola: string
  readonly socis: number
  readonly actius: number
  readonly punts: number
}

export interface MotiveRow {
  readonly motivo: string
  readonly punts: number
  readonly vegades: number
}

export interface Dashboard {
  readonly despenjats: readonly Drifting[]
  readonly assistencia: readonly AttendancePoint[]
  readonly per_tipus: readonly TypeRow[]
  readonly escoles: readonly SchoolRow[]
  readonly punts_per_motiu: readonly MotiveRow[]
}

export const dashboardKeys = {
  board: (bounds: Bounds) => ['junta', 'dashboard', bounds.from ?? '', bounds.to ?? ''] as const,
}

export async function fetchDashboard(bounds: Bounds): Promise<Dashboard> {
  const { data, error } = await supabase.rpc('admin_dashboard', {
    ...(bounds.from === null ? {} : { p_from: bounds.from }),
    ...(bounds.to === null ? {} : { p_to: bounds.to }),
  })
  if (error) throw new DbError(error)
  return data as unknown as Dashboard
}

/**
 * L'enllaç per escriure-li a algú.
 *
 * WhatsApp, amb el telèfon que la junta ja veu a `profile_contact`. No s'envia
 * res automàtic i no s'escriu cap missatge per ningú: la trucada humana és la
 * gràcia, i un missatge d'una app a algú que fa un mes que no ve és
 * exactament el contrari del que aquesta llista vol aconseguir.
 */
export function whatsappHref(telefon: string | null): string | null {
  if (telefon === null) return null
  const digits = telefon.replace(/[^\d+]/g, '').replace(/^\+/, '')
  return digits === '' ? null : `https://wa.me/${digits}`
}
