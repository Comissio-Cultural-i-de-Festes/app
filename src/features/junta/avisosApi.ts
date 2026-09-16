import { DbError, unwrapAs } from '@/lib/db'
import { supabase } from '@/lib/supabase'

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
}

export const avisosKeys = {
  tipus: () => ['junta', 'avisos', 'tipus'] as const,
  ofMember: (userId: string) => ['junta', 'avisos', 'soci', userId] as const,
}

const TIPUS_COLS = 'clau, gravetat, punts_suggerits, etiqueta, actiu, ordre'
const AVIS_COLS =
  'id, user_id, tipus, gravetat, nota, event_id, created_at, retirat_at, retirat_nota'

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
