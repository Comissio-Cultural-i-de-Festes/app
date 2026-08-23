import { unwrapAs } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * The trail.
 *
 * Every RPC that changes something a person would argue about writes a row
 * here, and until now nothing read them back. Two questions make this worth a
 * screen: who appointed that admin, and what does the association hold about
 * one particular person — the second being a request somebody has a right to
 * make and the junta has to be able to answer without a database client.
 */

export interface AuditRow {
  readonly id: string
  readonly accio: string
  readonly target_id: string | null
  readonly detall: unknown
  readonly created_at: string
  readonly profiles: { readonly nombre: string } | null
}

export const PAGE = 40

export const auditKeys = {
  page: (page: number) => ['junta', 'audit', page] as const,
}

/**
 * A page of it, newest first.
 *
 * The actor comes through the foreign key rather than a second round trip, and
 * it is nullable on purpose: `actor_id` is `on delete set null`, so an entry
 * outlives the account that made it. An unnamed row is still a true record of
 * something that happened, and dropping it would be the one thing an audit log
 * must never do.
 */
export async function fetchAudit(page: number): Promise<AuditRow[]> {
  const from = page * PAGE
  return unwrapAs<AuditRow[]>(
    supabase
      .from('audit_log')
      .select('id, accio, target_id, detall, created_at, profiles!audit_log_actor_id_fkey(nombre)')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1),
  )
}
