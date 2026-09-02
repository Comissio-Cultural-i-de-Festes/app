import { DbError, unwrapAs } from '@/lib/db'
import type { Escola, MemberRole } from '@/lib/model'
import { supabase } from '@/lib/supabase'

/**
 * Qui la porta.
 *
 * `setRole`, `fetchAdmins` i `fetchMembers` vivien a `paymentsApi.ts`, perquè
 * els rols eren un bloc dins de Pagaments. Els rols i els diners no tenen res
 * a veure —hi eren junts perquè les dues coses les fa la junta i cabien a la
 * mateixa pantalla— i ara que els rols en tenen una de pròpia, les consultes
 * també.
 *
 * DUES CLAUS I NO UNA. `paymentKeys.members()` era `['junta','members']` i
 * `memberKeys.list()` és `['junta','socis']`; totes dues tenen files de
 * `profiles` amb el rol a dins, i un canvi de rol només invalidava la primera.
 * O sigui que canviar un rol des de Pagaments deixava el rètol de rol de
 * `/junta/socis` dient el d'abans fins que algú recarregava. Aquí s'invaliden
 * les dues, i per això `memberKeys` s'importa des d'aquest fitxer.
 */

export interface RoleRow {
  readonly id: string
  readonly nombre: string
  readonly avatar_url: string | null
  readonly escola: Escola | null
  readonly role: MemberRole
}

export const roleKeys = {
  admins: () => ['junta', 'admins'] as const,
  members: () => ['junta', 'members'] as const,
  changes: () => ['junta', 'roleChanges'] as const,
}

const COLUMNS = 'id, nombre, avatar_url, escola, role'

/** Qui porta l'associació ara mateix, owner inclòs. */
export async function fetchAdmins(): Promise<RoleRow[]> {
  return unwrapAs<RoleRow[]>(
    supabase
      .from('profiles')
      .select(COLUMNS)
      .in('role', ['admin', 'owner'])
      .eq('estat', 'actiu')
      .order('nombre'),
  )
}

/** Els socis actius que encara no porten res. */
export async function fetchMembers(): Promise<RoleRow[]> {
  return unwrapAs<RoleRow[]>(
    supabase
      .from('profiles')
      .select(COLUMNS)
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

/**
 * El traspàs, que és una sola crida a posta.
 *
 * Pujar l'altre i baixar-te en dos passos deixaria l'associació amb dos owners
 * o amb cap, i `admin_set_member_role` no ho pot fer perquè refusa canviar el
 * propi rol. Migració 43.
 */
export async function transferOwner(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_transfer_owner', { p_user_id: userId })
  if (error) throw new DbError(error)
}

export interface RoleChange {
  readonly id: string
  readonly accio: string
  readonly created_at: string
  /** Qui ho va fer, o null si el compte ja no hi és: `actor_id` és `set null`. */
  readonly actor: string | null
  /** A qui, resolt a un nom quan es pot. */
  readonly target: string | null
  readonly to: MemberRole | null
}

interface AuditRoleRow {
  readonly id: string
  readonly accio: string
  readonly target_id: string | null
  readonly detall: { readonly a?: string } | null
  readonly created_at: string
  readonly profiles: { readonly nombre: string } | null
}

/**
 * Els últims canvis de rol, per posar-los al costat del botó que els fa.
 *
 * Filtrat per `accio` a Postgres i no aquí: el registre sencer són quaranta
 * files per pàgina de tot el que fa la junta, i baixar-les per ensenyar-ne dues
 * seria demanar els pagaments i les invitacions de tothom per descartar-los al
 * navegador. La pantalla del registre sencer ja existeix i l'enllaç hi porta.
 *
 * ELS NOMS DELS AFECTATS VAN EN UNA SEGONA CONSULTA, i no hi ha manera
 * d'estalviar-la: `audit_log.target_id` no és una clau forana —apunta a
 * perfils, esdeveniments, assistències i invitacions segons l'acció— i per tant
 * PostgREST no la pot incrustar. Són quatre identificadors com a màxim.
 *
 * Un nom que no es resol es queda a null i la pantalla ho diu d'una altra
 * manera. Passa amb qui s'ha donat de baixa, i una línia del registre que
 * desaparegués perquè no en sabem el nom seria el pitjor que pot fer un
 * registre.
 */
export async function fetchRoleChanges(): Promise<RoleChange[]> {
  const rows = await unwrapAs<AuditRoleRow[]>(
    supabase
      .from('audit_log')
      .select(
        'id, accio, target_id, detall, created_at, profiles!audit_log_actor_id_fkey(nombre)',
      )
      .in('accio', ['set_role', 'transfer_owner'])
      .order('created_at', { ascending: false })
      .limit(4),
  )

  const ids = [...new Set(rows.map((r) => r.target_id).filter((id): id is string => id !== null))]
  const names = new Map<string, string>()
  if (ids.length > 0) {
    const people = await unwrapAs<{ readonly id: string; readonly nombre: string }[]>(
      supabase.from('profiles').select('id, nombre').in('id', ids),
    )
    for (const p of people) names.set(p.id, p.nombre)
  }

  return rows.map((r) => ({
    id: r.id,
    accio: r.accio,
    created_at: r.created_at,
    actor: r.profiles?.nombre ?? null,
    target: r.target_id === null ? null : (names.get(r.target_id) ?? null),
    to:
      r.accio === 'transfer_owner'
        ? 'owner'
        : r.detall?.a === 'admin' || r.detall?.a === 'member' || r.detall?.a === 'owner'
          ? r.detall.a
          : null,
  }))
}
