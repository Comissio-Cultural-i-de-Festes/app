import { DbError, unwrapAs } from '@/lib/db'
import type { Escola, MemberRole } from '@/lib/model'
import { supabase } from '@/lib/supabase'

/**
 * Who has paid, and who runs this.
 *
 * The money itself happens somewhere else — Bizum, cash, whatever the treasurer
 * has always done. What the app replaces is the spreadsheet on somebody's
 * phone, so the only write here is a boolean.
 */

export interface AttendeeRow {
  readonly id: string
  readonly user_id: string
  readonly pagado: boolean
  readonly estado: string
  readonly profiles: {
    readonly nombre: string
    readonly avatar_url: string | null
    readonly escola: Escola | null
    readonly curs: number | null
  } | null
}

export interface AdminRow {
  readonly id: string
  readonly nombre: string
  readonly avatar_url: string | null
  readonly escola: Escola | null
  readonly role: MemberRole
}

export const paymentKeys = {
  attendees: (eventId: string) => ['junta', 'payments', eventId] as const,
  admins: () => ['junta', 'admins'] as const,
  members: () => ['junta', 'members'] as const,
}

/**
 * Everybody who said yes, and whether they have paid.
 *
 * The embed names its foreign key. `attendances` reaches `profiles` twice —
 * once as the member, once as whoever checked them in — and an unqualified
 * `profiles(...)` comes back as PGRST201 rather than as a guess.
 */
export async function fetchAttendees(eventId: string): Promise<AttendeeRow[]> {
  return unwrapAs<AttendeeRow[]>(
    supabase
      .from('attendances')
      .select(
        'id, user_id, pagado, estado, profiles!attendances_user_id_fkey(nombre, avatar_url, escola, curs)',
      )
      .eq('event_id', eventId)
      .in('estado', ['si', 'asistio'])
      .order('created_at', { ascending: true }),
  )
}

export async function setPaid(attendanceId: string, pagado: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_paid', {
    p_attendance_id: attendanceId,
    p_pagado: pagado,
  })
  if (error) throw new DbError(error)
}

export async function fetchAdmins(): Promise<AdminRow[]> {
  return unwrapAs<AdminRow[]>(
    supabase
      .from('profiles')
      .select('id, nombre, avatar_url, escola, role')
      .in('role', ['admin', 'owner'])
      .eq('estat', 'actiu')
      .order('nombre'),
  )
}

/** Active members who are not already running things. */
export async function fetchMembers(): Promise<AdminRow[]> {
  return unwrapAs<AdminRow[]>(
    supabase
      .from('profiles')
      .select('id, nombre, avatar_url, escola, role')
      .eq('role', 'member')
      .eq('estat', 'actiu')
      .order('nombre'),
  )
}

export async function setRole(userId: string, role: MemberRole): Promise<void> {
  const { error } = await supabase.rpc('admin_set_member_role', {
    p_user_id: userId,
    p_role: role,
  })
  if (error) throw new DbError(error)
}
