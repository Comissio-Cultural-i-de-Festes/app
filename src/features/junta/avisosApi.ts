import { DbError, unwrapAs } from '@/lib/db'
import { rpc, supabase } from '@/lib/supabase'

/**
 * Els avisos, i el catàleg que els posa nom.
 *
 * DUES TAULES I CAP ESCRIPTURA DIRECTA. Ni `avisos` ni `avis_tipus` tenen grant
 * d'INSERT, UPDATE o DELETE per a `authenticated`: el que un soci no ha de
 * poder fer de cap manera és un grant que falta, no una política que falta. Tot
 * el que escriu aquí baixa per una RPC `security definer`, i per això aquest
 * fitxer no té ni un sol `.insert()`.
 *
 * QUI LLEGEIX QUÈ. `avisos` té una sola política: els teus o tots si ets de la
 * junta. O sigui que `fetchAvisos(userId)` filtra per `user_id` encara que la
 * política ja ho faria per a un soci —és la mateixa raó que hi ha escrita a
 * `profile/api.ts`: recolzar-se en l'RLS per acotar funciona perfectament per a
 * un soci i ensenya a algú de la junta el registre sencer com si fos el seu.
 */

export interface AvisTipus {
  readonly clau: string
  readonly gravetat: number
  readonly punts_suggerits: number
  /**
   * El nom que la junta hi ha posat, quan n'hi ha posat un. Els quatre tipus
   * sembrats tenen traducció als tres locales i aquí porten `null`; un `clau`
   * que la junta inventi no en té cap, i llavors això és l'única cosa que
   * evita que la pantalla ensenyi la cadena crua. Mateixa solució que
   * `ranking_periods.etiqueta`.
   */
  readonly etiqueta: string | null
  readonly actiu: boolean
  readonly ordre: number
}

export interface AvisRow {
  readonly id: string
  readonly user_id: string
  readonly tipus: string
  readonly gravetat: number
  readonly nota: string
  readonly event_id: string | null
  readonly created_at: string
  readonly retirat_at: string | null
  readonly retirat_nota: string | null
  /**
   * Els punts que va restar, si en va restar, resolts per la clau forana.
   *
   * VE DE `points_log` I NO D'UNA COLUMNA A `avisos`, perquè no n'hi ha cap: la
   * fila del llibre major ÉS el registre dels punts i l'avís només hi apunta.
   * Arriba null quan l'avís no en va restar cap —el primer avís, que és el cas
   * que la migració 73 defensa— i llavors la pantalla no pinta cap número en
   * comptes de pintar un zero, que voldria dir una altra cosa.
   */
  readonly points_log: { readonly puntos: number } | null
}

/**
 * Les quatre columnes que el comptador necessita, i cap més.
 *
 * SENSE LA NOTA, i això és el motiu pel qual aquesta lectura no reaprofita
 * `AvisRow`. La llista de socis només ha de pintar un número al costat d'un
 * nom; baixar-se amb ell el motiu escrit de cada avís de tothom seria posar el
 * registre disciplinari sencer al telèfon de qui obre una llista.
 */
export interface AvisPeriode {
  readonly user_id: string
  readonly gravetat: number
  readonly created_at: string
  readonly retirat_at: string | null
}

/** Quants n'hi ha de vius i quanta gravetat sumen, per a una persona. */
export interface AvisCompte {
  readonly quants: number
  readonly gravetat: number
}

export const avisosKeys = {
  tipus: () => ['junta', 'avisos', 'tipus'] as const,
  ofMember: (userId: string) => ['junta', 'avisos', 'soci', userId] as const,
  comptes: () => ['junta', 'avisos', 'comptes'] as const,
}

const TIPUS_COLS = 'clau, gravetat, punts_suggerits, etiqueta, actiu, ordre'

const AVIS_COLS =
  'id, user_id, tipus, gravetat, nota, event_id, created_at, retirat_at, retirat_nota, ' +
  'points_log!avisos_points_log_id_fkey(puntos)'
const COMPTE_COLS = 'user_id, gravetat, created_at, retirat_at'

/**
 * El catàleg sencer, retirats inclosos.
 *
 * Els retirats hi són perquè un avís de fa dos cursos els continua fent servir
 * i la seva fila s'ha de poder pintar amb nom. Qui dibuixa un formulari filtra
 * per `actiu`; qui dibuixa història, no.
 */
export async function fetchAvisTipus(): Promise<AvisTipus[]> {
  return unwrapAs<AvisTipus[]>(
    supabase.from('avis_tipus').select(TIPUS_COLS).order('ordre').order('clau'),
  )
}

export async function fetchAvisos(userId: string): Promise<AvisRow[]> {
  return unwrapAs<AvisRow[]>(
    supabase
      .from('avisos')
      .select(AVIS_COLS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  )
}

/**
 * Els comptadors del curs, per a la llista de socis i el rebedor.
 *
 * DUES COLUMNES DE MENYS I CAP RPC. `avisos_del_periode()` era la manera que
 * proposava l'issue; per què no hi és i què costaria tornar-hi està escrit
 * sencer a `avisosCompte.ts`, que és on es fa el recompte.
 *
 * SENSE FILTRE PER DATA A LA CONSULTA, i a posta. La finestra la sap la
 * pantalla —`defaultPeriod(usePeriods())`, que és la fila `global` de
 * `ranking_periods` i per tant la mateixa que `private.periode_curs()`— i
 * filtrar aquí obligaria a passar-la-hi com a paràmetre i a tenir una clau de
 * cache per finestra. Les files d'una associació hi caben totes; la que decideix
 * quines compten és `compta()`, en un sol lloc i amb prova.
 */
export async function fetchAvisComptes(): Promise<AvisPeriode[]> {
  return unwrapAs<AvisPeriode[]>(supabase.from('avisos').select(COMPTE_COLS))
}

/**
 * Registrar-ne un.
 *
 * VA PEL `rpc()` GENÈRIC i no pel tipat, pel mateix motiu que `adjustPoints`: el
 * generador escriu `p_event_id: string` per a un paràmetre que admet null, i un
 * avís sense esdeveniment és el cas normal. El nom de la funció sí que queda
 * comprovat, que és la meitat que es taca d'escriure-la malament.
 */
export async function avisa(avis: {
  readonly userId: string
  readonly tipus: string
  readonly nota: string
  readonly punts: number
  readonly eventId: string | null
}): Promise<string> {
  const { data, error } = await rpc<string>('avisa', {
    p_user_id: avis.userId,
    p_tipus: avis.tipus,
    p_nota: avis.nota,
    p_punts: avis.punts,
    p_event_id: avis.eventId,
  })
  if (error) throw new DbError(error)
  return data ?? ''
}

/**
 * I retirar-ne un, que no l'esborra.
 *
 * La fila es queda i surt ratllada; el que passa és que `retirat_at` s'omple i,
 * si l'avís havia restat punts, `retira_avis()` escriu la fila compensatòria al
 * llibre major. Per això qui la crida ha d'invalidar també els punts de la
 * persona: n'hi ha una de nova que abans no hi era.
 */
export async function retiraAvis(avisId: string, nota: string): Promise<void> {
  const { error } = await supabase.rpc('retira_avis', { p_avis_id: avisId, p_nota: nota })
  if (error) throw new DbError(error)
}

export async function saveAvisTipus(tipus: {
  readonly clau: string
  readonly gravetat: number
  readonly punts_suggerits: number
  readonly ordre: number
  readonly etiqueta: string | null
  readonly actiu: boolean
}): Promise<void> {
  // `p_etiqueta` s'omet quan no n'hi ha en comptes d'enviar-hi null, com fa
  // `saveGrau` amb `p_id`: el paràmetre té `default null` a la funció, i amb
  // `exactOptionalPropertyTypes` un null explícit no encaixa amb el tipus
  // generat. El resultat a la base és el mateix.
  const { error } = await supabase.rpc('admin_set_avis_tipus', {
    p_clau: tipus.clau,
    p_gravetat: tipus.gravetat,
    p_punts_suggerits: tipus.punts_suggerits,
    p_ordre: tipus.ordre,
    p_actiu: tipus.actiu,
    ...(tipus.etiqueta === null ? {} : { p_etiqueta: tipus.etiqueta }),
  })
  if (error) throw new DbError(error)
}
