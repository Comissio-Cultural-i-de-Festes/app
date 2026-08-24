import { DbError, unwrapAs } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * Ideas, between events.
 *
 * The whole list comes back in one query. No definer function is needed and
 * that is not an accident: `proposals.vots` is maintained by a trigger and is
 * in the read grant, while the individual votes are not — so the list can be
 * ordered by a tally nobody can inflate and nobody can read row by row.
 *
 * What a member sees is decided by `prop_select_member`, not here: open and
 * accepted ideas are everybody's, and a turned-down one reaches its author and
 * nobody else. Filtering client-side as well would be a second copy of that
 * rule, drifting.
 */

export interface Proposal {
  readonly id: string
  readonly titol: string
  readonly descripcio: string | null
  readonly estat: 'oberta' | 'acceptada' | 'descartada'
  readonly event_id: string | null
  readonly nota_junta: string | null
  readonly decided_at: string | null
  readonly vots: number
  readonly user_id: string
  readonly created_at: string
  readonly autor: { readonly nombre: string; readonly avatar_url: string | null } | null
  readonly decisor: { readonly nombre: string } | null
  readonly esdeveniment: { readonly titulo: string; readonly starts_at: string } | null
}

export const proposalKeys = {
  list: () => ['proposals'] as const,
  myVotes: () => ['proposals', 'votes'] as const,
}

const COLUMNS =
  'id, titol, descripcio, estat, event_id, nota_junta, decided_at, vots, user_id, created_at, ' +
  'autor:profiles!proposals_user_id_fkey(nombre, avatar_url), ' +
  'decisor:profiles!proposals_decided_by_fkey(nombre), ' +
  'esdeveniment:events!proposals_event_id_fkey(titulo, starts_at)'

export async function fetchProposals(): Promise<Proposal[]> {
  return unwrapAs<Proposal[]>(
    supabase
      .from('proposals')
      .select(COLUMNS)
      // Most-voted first, and oldest first inside a tie: whoever said it
      // earlier waited longer.
      .order('vots', { ascending: false })
      .order('created_at', { ascending: true }),
  )
}

/**
 * Which ones I have backed.
 *
 * A separate query rather than an embed, because `pv_select_self` publishes
 * only my own rows — an embed would come back empty for everybody else's and
 * read as "nobody voted".
 */
export async function fetchMyVotes(): Promise<Set<string>> {
  const rows = await unwrapAs<{ proposal_id: string }[]>(
    supabase.from('proposal_votes').select('proposal_id'),
  )
  return new Set(rows.map((r) => r.proposal_id))
}

export async function vote(proposalId: string, userId: string, on: boolean): Promise<void> {
  // The tally on `proposals.vots` is a trigger's job. Nothing here touches it,
  // and nothing could: it is not in the update grant.
  const { error } = on
    ? await supabase.from('proposal_votes').insert({ proposal_id: proposalId, user_id: userId })
    : await supabase.from('proposal_votes').delete().eq('proposal_id', proposalId)
  if (error) throw new DbError(error)
}

export async function propose(titol: string, descripcio: string, userId: string): Promise<void> {
  const { error } = await supabase.from('proposals').insert({
    user_id: userId,
    titol: titol.trim(),
    descripcio: descripcio.trim() === '' ? null : descripcio.trim(),
  })
  if (error) throw new DbError(error)
}

/** Only while nobody has backed it: taking it away would take their vote too. */
export async function withdraw(proposalId: string): Promise<void> {
  const { error } = await supabase.from('proposals').delete().eq('id', proposalId)
  if (error) throw new DbError(error)
}

/** What deciding came back as. `ja_decidida` is an answer, not a fault. */
export type Decision = 'acceptada' | 'descartada' | 'ja_decidida'

export async function decide(
  id: string,
  accepta: boolean,
  nota: string,
  eventId: string | null,
): Promise<Decision> {
  const { data, error } = await supabase.rpc('admin_decide_proposal', {
    p_id: id,
    p_accepta: accepta,
    p_nota: nota,
    ...(eventId === null ? {} : { p_event_id: eventId }),
  })
  if (error) throw new DbError(error)
  return (data as unknown as { estat: Decision }).estat
}
