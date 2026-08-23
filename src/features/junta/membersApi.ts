import { DbError, unwrapAs } from '@/lib/db'
import type { Escola, MemberRole } from '@/lib/model'
import { supabase } from '@/lib/supabase'

/**
 * Everybody who is or was in the association.
 *
 * `pendent` is deliberately absent: those people are the invitations screen's
 * job, where approving somebody is the whole point and there is a sentence
 * explaining what they cannot do while they wait. Showing them here too would
 * be two places to approve from, drifting apart.
 */

export interface MemberRow {
  readonly id: string
  readonly nombre: string
  readonly avatar_url: string | null
  readonly escola: Escola | null
  readonly curs: number | null
  readonly grau: string | null
  readonly estat: string
  readonly role: MemberRole
}

export const memberKeys = {
  list: () => ['junta', 'socis'] as const,
}

export async function fetchAllMembers(): Promise<MemberRow[]> {
  return unwrapAs<MemberRow[]>(
    supabase
      .from('profiles')
      .select('id, nombre, avatar_url, escola, curs, grau, estat, role')
      .in('estat', ['actiu', 'baixa'])
      .order('nombre'),
  )
}

/**
 * Signing somebody out of the association, or back into it.
 *
 * The RPC is the only way: it refuses to leave the association without an
 * active owner, which is the one state nobody inside the app could undo.
 */
export async function setMemberEstat(userId: string, estat: 'actiu' | 'baixa'): Promise<void> {
  const { error } = await supabase.rpc('admin_set_member_estat', {
    p_user_id: userId,
    p_estat: estat,
  })
  if (error) throw new DbError(error)
}
