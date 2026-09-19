import { DbError, unwrapAs } from '@/lib/db'
import type { Abast, EventType } from '@/lib/model'
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
  /** Gairebé sempre null: qui crea una activitat no l'omple. Vegeu `pastNights`. */
  readonly ends_at: string | null
  readonly tipo: EventType
  /** Null mentre la revelació tapi el nom, cosa que a una activitat ja passada
   *  també pot passar: vegeu `fetchMemberNights`. */
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
 * `ends_at` VE PERQUÈ EL FUTUR S'HA DE PODER TREURE. Aquesta consulta deia que
 * no li calia cap filtre de data —«`asistio` només el posa la porta, o sigui
 * que una fila amb aquell estat és una activitat on la persona hi va ser»— i
 * el supòsit no el garanteix la base: `public.close_meeting()` escriu
 * `asistio` a tothom que consta a una reunió sense mirar-ne la data, i a les
 * dades de demostració ja n'hi ha un cas. El resultat era un encapçalament que
 * mentia, «ON HA ESTAT» amb una activitat d'aquí a tres dies. El tall el fa
 * `pastNights`, al costat de la seva prova, amb el mateix criteri que fa servir
 * la resta de l'app: vegeu `@/lib/eventEnd`.
 *
 * I VE D'`event_details`, NO D'`events`, que és on el posaria qui se'l mira des
 * d'aquí: `events` no té cap `ends_at` i demanar-l'hi és un 42703 —«column
 * events_1.ends_at does not exist»— que no es veu ni compilant ni des de
 * pgTAP, només per PostgREST. Viu a la filla que la revelació tapa, al costat
 * d'`event_title`, i per això arriba null mentre l'activitat no estigui
 * revelada.
 *
 * I UNA ACTIVITAT SENSE REVELAR SÍ QUE POT SORTIR A LA LLISTA. Aquí hi deia el
 * contrari —«una activitat sense revelar és del futur, i el que la tapa la
 * deixa fora igualment»— i no ho garanteix res: `events` no té cap CHECK que
 * lligui `reveal_at` amb `starts_at`, o sigui que una activitat ja passada amb
 * la revelació engegada més enllà és una fila perfectament legal. Comprovat amb
 * una: `starts_at` de fa deu dies i `reveal_at` d'aquí a trenta. `starts_at`
 * arriba —viu a `events`, i `events_select_member` només demana `published` i
 * `abast <> 'junta'`—, `event_title` i `event_details` no, i per tant
 * `pastNights` la compta amb les sis hores suposades i la fila es dibuixa.
 *
 * NO ÉS CAP FUITA, i per això no hi ha cap branca que la tregui: `events_public`
 * ja publica `starts_at`, `tipo` i `reveal_at` de tot esdeveniment publicat que
 * no sigui de junta, revelat o no —és el que fa que la pantalla de casa pugui
 * dibuixar el compte enrere d'una festa que encara no té nom. El que la
 * revelació tapa és el títol, la descripció i la ubicació, que són a les
 * filles, i aquí continuen tapats. La fila surt amb el nom genèric del tipus,
 * que és el que `MemberNightsBlock` ja pinta quan `titol` és null.
 *
 * EL TALL NO EL POT FER POSTGREST. Seria `coalesce(ends_at, starts_at + 6h) <=
 * now()`, que no és cap `.lt()` sobre una columna, i un filtre sobre una taula
 * incrustada no treu la fila del pare sinó que li buida l'incrustat: hauria
 * calgut `!inner` i una columna calculada a la vista. Són deu files, igual que
 * per l'ordre.
 *
 * L'ordre també es fa al client. PostgREST sap ordenar per una taula
 * incrustada, però la sintaxi és la que es trenca en silenci quan algú
 * reanomena una clau forana.
 *
 * `abast` VE PERQUÈ LA POLÍTICA NO TAPA LES REUNIONS DE JUNTA A TOTHOM, que és
 * el que aquest fitxer donava per fet. `att_select_public_si` i
 * `events_select_member` sí que les deixen fora d'un soci ras, però no són les
 * úniques polítiques de lectura: `att_select_admin` i `events_select_admin`
 * publiquen tota fila a qui compleix `private.is_admin()`, i a posta, que d'allà
 * les treu `/junta/reunions`. Amb les dues alhora, algú de la junta obrint
 * `/soci/:id` es trobava la reunió de junta a «ON HA ESTAT», amb el títol, i al
 * seu propi perfil la trobava sota la frase «això és el que qualsevol soci veu
 * de tu», que amb la reunió a la llista era falsa.
 *
 * EL FILTRE VA AQUÍ I NO A LA BASE, i és el mateix repartiment que
 * `fetchAjustEvents`: la vista ha de continuar servint-les a la junta perquè
 * `/junta/reunions` en viu, i el que no pot passar és que aquesta pantalla les
 * ensenyi. `/soci/:id` és el perfil públic, i el que s'hi veu ha de ser el
 * mateix per a tothom que hi entri, com ja fa `member_badges()`, que és
 * `definer` i tapa el títol d'una reunió de junta també a un admin.
 *
 * I MANA `abast`, NO `tipo` NI EL TÍTOL. Una assemblea és `tipo = 'reunio'` i
 * és oberta; «Junta de dimarts» és la que no ho és. Filtrar per `tipo` amagaria
 * l'assemblea a la qual la persona va anar de debò i no taparia res que no
 * estigués ja tapat. És el mateix eix que mira
 * `private.no_points_from_junta_meetings` i el mateix que filtra
 * `fetchAjustEvents`.
 *
 * LES COLUMNES SÓN UNA CONSTANT EXPORTADA perquè `tests/rls/member.test.ts` les
 * demani a PostgREST tal com les demana la pantalla. Aquella prova no comprova
 * que la reunió de junta no surti —això ja no és una propietat de la base— sinó
 * el contrari: que amb un token de la junta la base SÍ que la serveix, que és
 * el que fa que el filtre d'aquí dalt sigui l'únic que la tapa. Amb la cadena
 * copiada als dos llocs, el dia que una canviés la prova seguiria verda parlant
 * d'una consulta que ja no existeix.
 */
export const NIGHT_COLUMNS =
  'event_id, events!attendances_event_id_fkey(abast, starts_at, tipo, event_details(ends_at), event_title(titulo))'

export async function fetchMemberNights(userId: string): Promise<MemberNight[]> {
  const rows = await unwrapAs<
    {
      event_id: string
      events: {
        abast: Abast
        starts_at: string
        tipo: EventType
        event_details: { ends_at: string | null } | null
        event_title: { titulo: string } | null
      } | null
    }[]
  >(
    supabase
      .from('attendances')
      .select(NIGHT_COLUMNS)
      .eq('user_id', userId)
      .eq('estado', 'asistio'),
  )

  // Una fila sense esdeveniment vol dir que la política el va deixar fora —una
  // reunió de junta, per a un soci ras— i aleshores no hi ha res a ensenyar.
  // Amb `abast` sencera vol dir que qui mira és de la junta i la política la hi
  // ha donada: la que se'n va aquí és aquesta.
  return rows
    .filter((r) => r.events !== null && r.events.abast !== 'junta')
    .map((r) => ({
      event_id: r.event_id,
      starts_at: r.events?.starts_at ?? '',
      ends_at: r.events?.event_details?.ends_at ?? null,
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
