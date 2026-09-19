import { DbError, unwrapAs } from '@/lib/db'
import { rpc, supabase } from '@/lib/supabase'

/**
 * El llibre major d'una persona, vist des de la junta, i l'ajust que s'hi
 * escriu a sota.
 *
 * QUI HI ARRIBA ho decideix `plog_select_admin` (migració 04), que dóna a un
 * admin el llibre major sencer. Per això la lectura la fa `fetchPointsOf` de
 * `features/profile/api`, que és la mateixa consulta amb el mateix filtre
 * explícit: no n'hi ha dues, n'hi ha una i dues pantalles que la criden.
 *
 * I LA FILA DE LA PERSONA TAMPOC ÉS D'AQUÍ. Hi va haver un `fetchMemberProfile`
 * amb la seva clau `['junta','soci',id]` que demanava vuit columnes de
 * `profiles`; `fetchProfile` de `features/session/profile` ja en demana onze,
 * de la mateixa taula i amb el mateix filtre. Dues entrades de cache per a la
 * mateixa fila és una que es queda vella sense que res ho digui.
 *
 * L'ESCRIPTURA VA PER `award_points` amb `motivo = 'manual'`, i no hi ha cap
 * altra porta: `points_log` no té ni grant ni política d'INSERT per a
 * `authenticated`, ni per a la junta. La RPC és definer i és l'única entrada.
 *
 * LES CORRECCIONS SÓN FILES NOVES. `points_log` és append-only pel disparador
 * `private.points_log_no_update` (migració 07), així que una correcció de -20
 * és una fila de -20 al costat de la de +20 i totes dues es veuen. Això no és
 * una limitació que s'aguanti: és el que fa que el registre serveixi de res.
 */

/** Un esdeveniment al qual es pot penjar l'ajust, si es vol penjar a algun. */
export interface AjustEvent {
  readonly id: string
  readonly titulo: string | null
  readonly starts_at: string
}

export const memberPointsKeys = {
  events: () => ['junta', 'soci', 'esdeveniments'] as const,
}

/**
 * On es pot penjar un ajust: el que ja ha passat, del més recent cap enrere.
 *
 * CAP ENRERE I NO CAP ENDAVANT, que és el contrari de `fetchJuntaEvents`. Un
 * ajust manual és retrospectiu per definició —es corregeix el que ja va
 * passar—, i una llista que comenci per la festa del mes que ve obliga a
 * baixar per trobar la d'anit.
 *
 * SENSE EXCLOURE LES REUNIONS, tampoc al revés que aquella: allà s'exclouen
 * perquè una reunió no es cobra ni es proposa, i aquí sí que s'hi pot haver
 * fet una cosa que valgui punts. Una assemblea és una reunió i s'hi munta,
 * s'hi porta gent i s'hi recull.
 *
 * PERÒ SÍ EXCLOENT LES D'ÀMBIT JUNTA, que no és el mateix eix i és el que
 * aquesta llista es mirava malament. `private.no_points_from_junta_meetings`
 * —disparador BEFORE INSERT de `points_log` des de la migració 48— refusa amb
 * 22023 qualsevol fila penjada d'un esdeveniment amb `abast = 'junta'`. El
 * que mira no és `tipo = 'reunio'`: «Assemblea de setembre» és una reunió i sí
 * que reparteix punts; «Junta de dimarts» no. Oferir-la era oferir una opció
 * que la base refusa sempre, i el 22023 arriba a `errorKey` com a classe 22 i
 * es llegeix «Torna-ho a provar d'aquí un moment» —un consell que no pot
 * funcionar mai, perquè tornar-hi torna a fallar.
 *
 * ES FILTRA AQUÍ I NO A LA VISTA: `events_public` ha de continuar servint les
 * reunions de junta, que és d'on les treu la pantalla de reunions
 * (`fetchMeetings`). El que no pot passar és que aquest desplegable les
 * ofereixi.
 *
 * `titulo` pot arribar null —un esdeveniment que encara no s'ha revelat—, i la
 * pantalla hi posa la data. Filtrar-los seria amagar-li a la junta un
 * esdeveniment que ella mateixa ha creat.
 */
export async function fetchAjustEvents(limit = 25): Promise<AjustEvent[]> {
  return unwrapAs<AjustEvent[]>(
    supabase
      .from('events_public')
      .select('id, titulo, starts_at')
      .lte('starts_at', new Date().toISOString())
      .neq('abast', 'junta')
      .order('starts_at', { ascending: false })
      .limit(limit),
  )
}

export interface Ajust {
  readonly userId: string
  readonly punts: number
  readonly nota: string
  /** Null quan l'ajust no penja de cap esdeveniment, que és el cas normal. */
  readonly eventId: string | null
}

/**
 * L'ajust, tal com el rep la base.
 *
 * `p_nota` no és opcional aquí encara que la signatura SQL li doni un valor
 * per defecte: des de la migració 72 un `manual` sense nota torna 22023, i
 * deixar-ho com a paràmetre opcional en aquest costat seria convidar a
 * escriure la crida que falla.
 *
 * VA PEL `rpc()` GENÈRIC i no per `supabase.rpc` tipat perquè el generador no
 * sap expressar que un paràmetre de funció admeti null: escriu
 * `p_event_id: string` quan la columna és nullable i un ajust sense
 * esdeveniment és justament el cas normal. El nom de la funció sí que queda
 * comprovat, que és la meitat que es taca d'escriure-la malament; la resta la
 * comprova Postgres, i el fitxer de proves de la migració 72 ho cobreix.
 */
export async function adjustPoints(ajust: Ajust): Promise<void> {
  const { error } = await rpc<string>('award_points', {
    p_user_id: ajust.userId,
    p_event_id: ajust.eventId,
    p_motivo: 'manual',
    p_puntos: ajust.punts,
    p_nota: ajust.nota,
  })
  if (error) throw new DbError(error)
}
