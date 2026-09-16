import { DbError, unwrapAs } from '@/lib/db'
import type { EventType } from '@/lib/model'
import { supabase } from '@/lib/supabase'
import type { Streak } from '@/features/profile/streak'

/**
 * Qui és una altra persona de la comi.
 *
 * LA MEITAT D'AQUEST FITXER NO TÉ CAP MIGRACIÓ AL DARRERE, i és a posta: «qui
 * és» i «a què ha vingut» són preguntes que l'esquema ja contestava i que
 * ningú no havia fet mai. `profiles_select_directory` publica tota fila amb
 * `estat = 'actiu'` a qualsevol soci, i `att_select_public_si` publica els
 * `asistio` d'un esdeveniment publicat que no sigui una reunió de junta. La
 * consulta de les nits és literalment la de `fetchInside()` girada: per persona
 * en comptes de per esdeveniment.
 *
 * L'ALTRA MEITAT SÍ, perquè `badges` i la ratxa viuen en taules tancades: les
 * insígnies només les llegeix qui les té i `my_streak()` sempre és `auth.uid()`.
 * Les dues funcions de la migració 75 són el mateix patró que `ranking_period()`
 * fa servir per publicar sumes sobre `points_log` sense obrir-lo.
 *
 * EL QUE NO HI HA, I PER QUÈ. Cap crida que torni el desglossament de punts per
 * motiu. El rànquing publica el total i prou, i la `nota` d'un ajust manual —el
 * motiu pel qual la junta va treure punts a algú— és d'aquella persona i de la
 * junta. Els punts d'aquesta pantalla surten de `ranking_period()`, que la
 * pantalla del rànquing ja es baixa, i no d'una consulta nova.
 */

export interface MemberNight {
  readonly event_id: string
  readonly starts_at: string
  readonly tipo: EventType
  /** Null mentre la revelació tapi el nom, que a una activitat passada no passa. */
  readonly titol: string | null
}

export interface MemberBadge {
  readonly codi: string
  readonly earned_at: string
  readonly event_id: string | null
  readonly titol: string | null
  readonly starts_at: string | null
}

/**
 * Es diu `sociKeys` i no `memberKeys`, que és com va néixer.
 *
 * `junta/membersApi.ts` ja exporta un `memberKeys` —el de la llista de socis,
 * `['junta','socis']`— i aquest és el de les tres consultes d'una persona,
 * `['member', id, …]`. Dos noms iguals amb formes diferents no petaven avui
 * perquè cap fitxer importava tots dos; el primer que ho necessités hauria
 * d'haver renombrat un dels dos a l'`import` i hauria triat quin segons el que
 * li anés bé aquella tarda. El nom d'aquest és el de la seva pantalla,
 * `SociScreen`, igual que aquella va triar el nom de la seva ruta.
 */
export const sociKeys = {
  nights: (userId: string) => ['member', userId, 'nights'] as const,
  streak: (userId: string) => ['member', userId, 'streak'] as const,
  badges: (userId: string) => ['member', userId, 'badges'] as const,
}

/**
 * A què ha vingut.
 *
 * Sense cap filtre de data: `asistio` només el posa la porta, o sigui que una
 * fila amb aquell estat és una activitat on la persona hi va ser. Afegir-hi
 * «i que ja hagi passat» seria una segona còpia d'aquella regla, i la que
 * s'està celebrant ara mateix és exactament la que val la pena que hi surti.
 *
 * L'ordre es fa al client. PostgREST sap ordenar per una taula incrustada,
 * però són deu files i la sintaxi és la que es trenca en silenci quan algú
 * reanomena una clau forana.
 */
export async function fetchMemberNights(userId: string): Promise<MemberNight[]> {
  const rows = await unwrapAs<
    {
      event_id: string
      events: {
        starts_at: string
        tipo: EventType
        event_title: { titulo: string } | null
      } | null
    }[]
  >(
    supabase
      .from('attendances')
      .select('event_id, events!attendances_event_id_fkey(starts_at, tipo, event_title(titulo))')
      .eq('user_id', userId)
      .eq('estado', 'asistio'),
  )

  // Una fila sense esdeveniment vol dir que la política el va deixar fora —una
  // reunió de junta, per a qui no hi és— i aleshores no hi ha res a ensenyar.
  return rows
    .filter((r) => r.events !== null)
    .map((r) => ({
      event_id: r.event_id,
      starts_at: r.events?.starts_at ?? '',
      tipo: r.events?.tipo ?? 'actividad',
      titol: r.events?.event_title?.titulo ?? null,
    }))
}

/**
 * La ratxa d'un altre, amb la mateixa forma que la teva.
 *
 * Null quan la persona ja no és sòcia, i això no és un error: la capçalera de
 * la pantalla ja ho diu una vegada, i tres avisos vermells per al mateix fet
 * seria dir-ho tres vegades.
 */
export async function fetchMemberStreak(userId: string): Promise<Streak | null> {
  const { data, error } = await supabase.rpc('member_streak', { p_user: userId })
  if (error) throw new DbError(error)
  return data as unknown as Streak | null
}

/**
 * Les seves insígnies, i NOMÉS llegir-les.
 *
 * `my_badges()` reparteix les que toquin abans de tornar res —és el que la fa
 * retroactiva— i `member_badges()` no ho fa a posta: obrir el perfil d'algú no
 * li ha de regalar cap insígnia, i qui les guanya no pot dependre de qui el
 * mira. La funció està declarada `stable` a la base perquè això no depengui de
 * recordar-ho.
 */
export async function fetchMemberBadges(userId: string): Promise<MemberBadge[]> {
  const { data, error } = await supabase.rpc('member_badges', { p_user: userId })
  if (error) throw new DbError(error)
  // Sense cap `as`: `returns table` no sap dir que una columna pot ser null, o
  // sigui que els tipus generats diuen `titol: string` quan de fet és
  // `string | null` —`MemberBadge` és la forma corregida, i la generada hi
  // encaixa sense forçar-la. El `??` sí que cal: PostgREST torna null quan la
  // funció no torna cap fila.
  return data ?? []
}
