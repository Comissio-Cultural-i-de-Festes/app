import { DbError, unwrapAs } from '@/lib/db'
import type { Escola } from '@/lib/model'
import { supabase } from '@/lib/supabase'

/**
 * Invitations, and the people waiting behind them.
 *
 * The code itself is minted by the database — the client used to have to
 * invent the string and then handle a unique violation it did not expect — and
 * both creating and revoking leave an audit row. See migration 16.
 */

export interface InviteRow {
  readonly id: string
  readonly codi: string
  readonly expires_at: string | null
  readonly revoked: boolean
  readonly max_usos: number | null
  readonly created_at: string
  readonly invite_uses: { readonly count: number }[]
}

export interface PendingRow {
  readonly id: string
  readonly nombre: string
  readonly escola: Escola | null
  readonly created_at: string
}

export const juntaKeys = {
  invites: () => ['junta', 'invites'] as const,
  pending: () => ['junta', 'pending'] as const,
}

export async function fetchInvites(): Promise<InviteRow[]> {
  return unwrapAs<InviteRow[]>(
    supabase
      .from('invites')
      .select('id, codi, expires_at, revoked, max_usos, created_at, invite_uses(count)')
      .order('created_at', { ascending: false })
      .limit(20),
  )
}

export async function fetchPending(): Promise<PendingRow[]> {
  return unwrapAs<PendingRow[]>(
    supabase
      .from('profiles')
      .select('id, nombre, escola, created_at')
      .eq('estat', 'pendent')
      .order('created_at', { ascending: true }),
  )
}

export function usesOf(invite: InviteRow): number {
  return invite.invite_uses[0]?.count ?? 0
}

/**
 * The one code that is live right now.
 *
 * "One code per group and that is it" is the whole model: a single string to
 * paste, and killing it is one action rather than an audit of which of nine
 * codes leaked. So the newest one that still works is the one the screen
 * shows, and the rest are history.
 */
export function activeInvite(rows: readonly InviteRow[], now = Date.now()): InviteRow | null {
  return (
    rows.find(
      (r) =>
        !r.revoked &&
        (r.expires_at === null || Date.parse(r.expires_at) > now) &&
        (r.max_usos === null || usesOf(r) < r.max_usos),
    ) ?? null
  )
}

export async function createInvite(expiresAt: Date | null, maxUses: number | null): Promise<void> {
  const { error } = await supabase.rpc('admin_create_invite', {
    ...(expiresAt === null ? {} : { p_expires_at: expiresAt.toISOString() }),
    ...(maxUses === null ? {} : { p_max_usos: maxUses }),
  })
  if (error) throw new DbError(error)
}

export async function revokeInvite(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_revoke_invite', { p_id: id })
  if (error) throw new DbError(error)
}

export async function setMemberState(userId: string, estat: 'actiu' | 'baixa'): Promise<void> {
  const { error } = await supabase.rpc('admin_set_member_estat', {
    p_user_id: userId,
    p_estat: estat,
  })
  if (error) throw new DbError(error)
}

/**
 * The link that gets pasted into the group.
 *
 * A query parameter and not a path, deliberately. The invitation has to
 * survive a round trip through Google's sign-in and back, and `?codi=` is the
 * shape that was tested end to end on a real iPhone from an installed app.
 * The prototype draws a prettier `comi.example/ABC-123`; a prettier link is
 * not worth re-testing the one flow nobody can debug remotely.
 */
export function inviteLink(code: string, origin = window.location.origin): string {
  return `${origin}/?codi=${encodeURIComponent(code)}`
}
