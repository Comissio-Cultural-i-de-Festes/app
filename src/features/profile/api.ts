import { DbError, unwrap, unwrapAs } from '@/lib/db'
import { AVATARS, shrinkImage, uploadAvatar } from '@/lib/storage'
import { supabase } from '@/lib/supabase'

import type { Streak } from './streak'

/**
 * Where the points came from, and what has happened lately.
 *
 * Both read `points_log`, which every member may read for themselves and for
 * nobody else. The breakdown is worked out here rather than in SQL: it is a
 * dozen rows, grouping them client-side costs nothing, and a view would be one
 * more thing whose privileges have to be got right.
 */

export type PointMotive =
  'asistencia' | 'montaje' | 'trajo_gente' | 'propuso' | 'conduir' | 'manual'

export interface PointRow {
  readonly id: string
  readonly motivo: PointMotive
  readonly puntos: number
  readonly created_at: string
  readonly nota: string | null
  /**
   * Des de la migració 44 el títol viu a `event_title` i s'hi arriba amb un
   * salt més, perquè `points_log` no hi té clau forana: hi arriba per
   * `events`. Si l'esdeveniment encara no està revelat, la política deixa la
   * fila fora i això és null —el registre de punts d'una festa que encara no
   * es pot dir surt amb el motiu i no amb el nom.
   */
  readonly events: { readonly event_title: { readonly titulo: string } | null } | null
}

export const profileScreenKeys = {
  points: (userId: string) => ['profile', 'points', userId] as const,
  attended: (userId: string) => ['profile', 'attended', userId] as const,
  streak: (userId: string) => ['profile', 'streak', userId] as const,
}

/**
 * La ratxa, calculada pel servidor a cada crida.
 *
 * No es desa enlloc a posta: un comptador desat es desquadraria el dia que la
 * junta desfés un fitxatge amb `admin_undo_checkin`. El que decideix quines
 * activitats compten viu tot a `private.streak_rows()`, i el client no en sap
 * res — ni ho ha de saber, perquè una regla que viu al navegador és una regla
 * que es pot reescriure.
 */
export async function fetchStreak(): Promise<Streak> {
  const { data, error } = await supabase.rpc('my_streak')
  if (error) throw new DbError(error)
  return data as unknown as Streak
}

/**
 * Your rows, and the filter is not optional.
 *
 * `points_log` has two select policies: one for your own rows and one that
 * hands an admin the whole ledger. Leaning on row-level security to scope this
 * works perfectly for an ordinary member and shows somebody on the junta the
 * association's entire points history as though it were their own — which is
 * what it did until this line was added.
 */
export async function fetchMyPoints(userId: string): Promise<PointRow[]> {
  return unwrapAs<PointRow[]>(
    supabase
      .from('points_log')
      .select('id, motivo, puntos, created_at, nota, events(event_title(titulo))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
  )
}

/** How many events you have actually turned up to. Counted, not listed. */
export async function fetchAttendedCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('attendances')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('estado', 'asistio')

  if (error) throw new DbError(error)
  return count ?? 0
}

export interface MotiveTotal {
  readonly motivo: PointMotive
  readonly punts: number
  readonly vegades: number
}

/**
 * Totals per reason, biggest first.
 *
 * Corrections are negative rows in the same ledger, so a reason can net to
 * zero or below; those still belong in the list, because "montaje 0" after an
 * argument is information and a missing line is not.
 */
export function byMotive(rows: readonly PointRow[]): MotiveTotal[] {
  const totals = new Map<PointMotive, MotiveTotal>()

  for (const row of rows) {
    const seen = totals.get(row.motivo)
    totals.set(row.motivo, {
      motivo: row.motivo,
      punts: (seen?.punts ?? 0) + row.puntos,
      vegades: (seen?.vegades ?? 0) + 1,
    })
  }

  return [...totals.values()].sort((a, b) => b.punts - a.punts)
}

export async function setHideFromRanking(userId: string, hidden: boolean): Promise<void> {
  await unwrap(
    supabase.from('profiles').update({ hide_from_ranking: hidden }).eq('id', userId).select('id'),
  )
}

/**
 * El nom i la foto, les dues coses que es poden canviar del perfil.
 *
 * Van pel `update` directe i no per una RPC: `profiles` té el `grant update`
 * columna a columna des de la migració 03 i `profiles_update_self` a la 04, i
 * el disparador `private.profiles_guard()` refusa `role`, `estat`, `id` i
 * `created_at` encara que algú els afegeixi al mateix `update`. La barrera ja
 * hi és; una RPC només hi afegiria una signatura per mantenir.
 *
 * El `.select('id')` no és decoració: sense ell un `update` que cap fila
 * satisfà torna 200 amb un array buit, i això és indistinguible d'haver desat.
 */
export async function setMyName(userId: string, nombre: string): Promise<void> {
  await unwrap(supabase.from('profiles').update({ nombre }).eq('id', userId).select('id'))
}

/**
 * Puja la foto i la deixa apuntada al perfil, en aquest ordre.
 *
 * Primer l'objecte i després la columna. A l'inrevés hi hauria un instant amb
 * `avatar_url` apuntant a un camí que encara no existeix, i durant aquell
 * instant la cara de la persona és un marc trencat a totes les llistes on
 * surt. Si la pujada falla, la columna no s'ha tocat i la foto d'abans encara
 * hi és.
 *
 * L'objecte que sobra no s'esborra. Un avatar antic ocupa cinquanta kB i
 * esborrar-lo voldria dir una segona operació que pot fallar tota sola,
 * deixant la columna canviada i l'error a la pantalla d'algú que ja havia
 * acabat. «Treu-la» sí que esborra, perquè allà treure és la funció.
 */
export async function setMyPhoto(userId: string, file: Blob): Promise<void> {
  const body = file instanceof File ? await shrinkImage(file) : file
  const path = await uploadAvatar(body, userId)
  await unwrap(
    supabase.from('profiles').update({ avatar_url: path }).eq('id', userId).select('id'),
  )
}

/** La de Google, que ja és a `user_metadata` des que la persona va entrar. */
export async function revertToGooglePhoto(userId: string): Promise<void> {
  const { data } = await supabase.auth.getUser()
  const meta = data.user?.user_metadata ?? {}
  const picture =
    typeof meta.avatar_url === 'string' && meta.avatar_url !== ''
      ? meta.avatar_url
      : typeof meta.picture === 'string' && meta.picture !== ''
        ? meta.picture
        : null

  // Sense res a `user_metadata` no es pot tornar enrere, i posar null seria
  // treure-la en comptes de recuperar-la —que és una altra acció, amb el seu
  // propi botó. Passa amb els comptes creats per correu.
  if (picture === null) throw new Error('no google picture')
  await unwrap(
    supabase.from('profiles').update({ avatar_url: picture }).eq('id', userId).select('id'),
  )
}

/**
 * Treu la foto: la columna a null i l'objecte del bucket, si n'hi havia.
 *
 * La columna primer. Si l'esborrat de l'objecte falla —un permís, una fila que
 * ja no hi és— el que la persona ha demanat ja ha passat: la seva cara no surt
 * enlloc. Un objecte orfe al bucket és brossa; una foto que continua sortint
 * després de dir que la treguis és una promesa incomplerta.
 */
export async function clearMyPhoto(userId: string, current: string | null): Promise<void> {
  await unwrap(
    supabase.from('profiles').update({ avatar_url: null }).eq('id', userId).select('id'),
  )

  const stored =
    current !== null && current !== '' && !current.startsWith('http') ? current : null
  if (stored !== null) await supabase.storage.from(AVATARS).remove([stored])
}
