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
  /**
   * Què en va fer la junta, si ho ha escrit (migració 86). La llegeix qui llegeix
   * l'avís: la junta i la persona afectada.
   */
  readonly mesura_presa: string | null
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

/**
 * Quants n'hi ha de vius i quant pesen, per a una persona. El pes és el de la
 * normativa (migració 84), no la gravetat pelada.
 */
export interface AvisCompte {
  readonly quants: number
  readonly pes: number
}

export const avisosKeys = {
  tipus: () => ['junta', 'avisos', 'tipus'] as const,
  ofMember: (userId: string) => ['junta', 'avisos', 'soci', userId] as const,
  // Penja de `ofMember` a posta: qui avisa o retira invalida l'arrel i se'n van
  // les dues, la sencera de la fitxa i la del curs del perfil. Amb dues claus
  // germanes, invalidar-ne una deixaria l'altra dient el que deia.
  ofMemberPeriode: (userId: string, desDe: string | null, finsA: string | null) =>
    ['junta', 'avisos', 'soci', userId, 'periode', desDe, finsA] as const,
  comptes: (desDe: string | null) => ['junta', 'avisos', 'comptes', desDe] as const,
  // L'arrel, per invalidar. Hi ha una entrada de cache per finestra i qui acaba
  // d'avisar algú les ha de tornar a demanar totes: amb la clau sencera
  // n'invalidaria una i deixaria la del curs passat dient el que deia.
  comptesTots: () => ['junta', 'avisos', 'comptes'] as const,
}

const TIPUS_COLS = 'clau, gravetat, punts_suggerits, etiqueta, actiu, ordre'

const AVIS_COLS =
  'id, user_id, tipus, gravetat, nota, mesura_presa, event_id, created_at, retirat_at, retirat_nota, ' +
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

/**
 * Els avisos d'una persona, opcionalment només els d'una finestra.
 *
 * DOS CRIDADORS AMB DUES NECESSITATS OPOSADES, i per això la finestra és un
 * paràmetre i no una decisió d'aquí dins:
 *
 *   LA FITXA DE LA JUNTA ELS VOL TOTS. És la pantalla on algú va a entendre què
 *   porta una persona abans de registrar-li res, i «què porta» inclou el que va
 *   passar fa dos cursos. Qui la mira ha de poder veure que això ja va passar
 *   un cop. El que la fitxa NO fa és comptar-los tots a la capçalera: el
 *   número és el del curs, com el de la llista de socis, i qui ho decideix és
 *   `compta()`.
 *
 *   EL PERFIL DEL SOCI ELS VOL DEL CURS. La targeta diu «el que la junta ha
 *   registrat aquest curs» i l'issue demanava «els avisos del període». Sense
 *   la finestra, una fila de fa tres cursos sortia la primera sota aquella
 *   frase, i com que la columna de la data no porta l'any, es llegia com si
 *   fos d'ara.
 *
 * `desDe` NUL VOL DIR SENSE FITAR, com a `fetchAvisComptes`. Qui vulgui la
 * finestra del curs no hi ha de passar un null «perquè encara no ho sap»:
 * `useCurs().llest` diu quan la resposta és de debò.
 *
 * SENSE `limit` I AMB MOTIU. `max_rows = 1000` de PostgREST trunca en silenci,
 * i per això `fetchAvisComptes` va fitada: aquella baixa els avisos de TOTHOM.
 * Aquesta és d'una sola persona, i mil avisos a una sola persona no és un
 * escenari que calgui defensar —si hi arribéssim, el problema no seria la
 * consulta.
 */
export async function fetchAvisos(
  userId: string,
  desDe: string | null = null,
  finsA: string | null = null,
): Promise<AvisRow[]> {
  let q = supabase
    .from('avisos')
    .select(AVIS_COLS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (desDe !== null) q = q.gte('created_at', desDe)
  // Final exclusiu, com el `<` de `periode_curs()`: el primer instant del curs
  // que ve és del curs que ve.
  if (finsA !== null) q = q.lt('created_at', finsA)
  return unwrapAs<AvisRow[]>(q)
}

/**
 * Els comptadors del curs, per a la llista de socis i el rebedor.
 *
 * DUES COLUMNES DE MENYS I CAP RPC. `avisos_del_periode()` era la manera que
 * proposava l'issue; per què no hi és i què costaria tornar-hi està escrit
 * sencer a `avisosCompte.ts`, que és on es fa el recompte.
 *
 * FITADA PEL COMENÇAMENT DEL CURS, i això no és una optimització: és una
 * truncació silenciosa evitada. `supabase/config.toml` posa `max_rows = 1000` a
 * PostgREST, o sigui que una lectura sense fitar es queda a mil files I NO DONA
 * CAP ERROR. El dia que l'associació en porti mil acumulades, el comptador
 * començaria a dir un número més petit del que toca i res no ho diria; amb el
 * filtre, el que baixa és el curs, que no hi arriba ni de lluny.
 *
 * QUI DECIDEIX QUINES COMPTEN CONTINUA SENT `compta()`, que torna a aplicar la
 * mateixa finestra —i el final, i el retirat— sobre el que ha arribat. El filtre
 * d'aquí acota el que viatja; la regla viu en un sol lloc i té prova.
 *
 * `desDe` NUL VOL DIR SENSE FITAR, que és el cas d'una base sense períodes
 * configurats. Qui la crida no ha de passar-hi un null «perquè encara no ho sap»:
 * `useNormativa().llest` diu quan la resposta és de debò.
 */
export async function fetchAvisComptes(desDe: string | null): Promise<AvisPeriode[]> {
  const q = supabase.from('avisos').select(COMPTE_COLS)
  return unwrapAs<AvisPeriode[]>(desDe === null ? q : q.gte('created_at', desDe))
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
  /** La triada. Null vol dir «la del tipus», que és el que decideix la base. */
  readonly gravetat: number | null
  readonly nota: string
  /** Opcional. Null vol dir que encara no se n'ha pres cap. */
  readonly mesuraPresa: string | null
  readonly punts: number
  readonly eventId: string | null
}): Promise<string> {
  const { data, error } = await rpc<string>('avisa', {
    p_user_id: avis.userId,
    p_tipus: avis.tipus,
    p_nota: avis.nota,
    p_punts: avis.punts,
    p_event_id: avis.eventId,
    p_gravetat: avis.gravetat,
    p_mesura_presa: avis.mesuraPresa,
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

/**
 * Escriure, canviar o esborrar la mesura presa d'un avís que ja existeix.
 *
 * `null` L'ESBORRA: `edita_mesura_presa()` passa el text per `nota_neta`, i un
 * blanc queda null. S'envia com a cadena buida perquè el tipus generat no admet
 * null, i a la base és el mateix.
 */
export async function editaMesuraPresa(avisId: string, mesura: string | null): Promise<void> {
  const { error } = await supabase.rpc('edita_mesura_presa', {
    p_avis_id: avisId,
    p_mesura: mesura ?? '',
  })
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
