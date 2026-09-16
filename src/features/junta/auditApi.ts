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

/**
 * Les accions el `target_id` de les quals és una persona.
 *
 * UNA LLISTA I NO «TOTES», i aquest és el motiu pel qual `audit_log.target_id`
 * no té clau forana cap a `profiles`: la columna no apunta sempre al mateix
 * lloc. `delete_event` hi guarda un esdeveniment, `decide_proposal` una idea,
 * `close_meeting` una reunió. Buscar aquells uuid a la llista de socis no
 * trobaria res gairebé sempre —i la vegada que en trobés seria per casualitat,
 * que és pitjor.
 *
 * Va començar amb una sola entrada perquè `award_points` era l'única frase que
 * es quedava coixa sense el nom: «ha donat punts» sense dir a qui no contesta
 * res. Afegir-n'hi una vol dir afegir-la aquí i posar el `{{target}}` a la seva
 * frase dels tres locales.
 *
 * I AIXÒ ÉS EXACTAMENT EL QUE LA MIGRACIÓ 73 NO VA FER. `avisa()` i
 * `retira_avis()` escriuen `target_id` amb la persona, i les seves frases deien
 * «ha registrat un avís A ALGÚ» i «ha retirat un avís» tenint el nom a mà. En un
 * registre disciplinari, «a algú» és pitjor que a qualsevol altra fila: qui obre
 * `/junta/registre` per contestar «què teniu sobre mi» troba una acció que el
 * pot afectar i cap manera de saber-ho sense obrir la base. És el mateix defecte
 * que aquesta llista va néixer per arreglar, tornat a posar tres migracions
 * després.
 *
 * `set_avis_tipus` NO HI ÉS, i no per descuit: canviar el catàleg no és una cosa
 * que es faci A ningú. El seu `target_id` és null perquè no hi ha cap persona a
 * l'altra banda.
 */
export const ACCIONS_AMB_PERSONA: ReadonlySet<string> = new Set([
  'award_points',
  'avis',
  'retira_avis',
])

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

/**
 * A qui, quan l'acció en té un i el nom es pot resoldre.
 *
 * Es resol al client amb la llista de socis que la junta ja es descarrega, i
 * no per un `embed` de PostgREST, perquè sense clau forana no n'hi pot haver.
 *
 * Torna null —i no una cadena buida— quan el nom no hi és: un compte esborrat
 * continua deixant la seva fila al registre, i la pantalla hi posa una frase
 * que ho diu en comptes d'un forat.
 */
export function targetNom(row: AuditRow, noms: ReadonlyMap<string, string>): string | null {
  if (!ACCIONS_AMB_PERSONA.has(row.accio)) return null
  if (row.target_id === null) return null
  return noms.get(row.target_id) ?? null
}
