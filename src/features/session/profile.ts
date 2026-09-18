import type { Escola } from '@/lib/model'
import { unwrapMaybe } from '@/lib/db'
import { supabase } from '@/lib/supabase'

export interface MyProfile {
  readonly id: string
  readonly nombre: string
  readonly avatar_url: string | null
  readonly escola: Escola | null
  readonly grau: string | null
  readonly curs: number | null
  /** Nom d'usuari sense @, o null. Públic per a tot soci actiu, a posta. */
  readonly instagram: string | null
  readonly hide_from_ranking: boolean
  readonly created_at: string
  readonly estat: 'pendent' | 'actiu' | 'baixa'
  readonly role: 'member' | 'admin' | 'owner'
}

/**
 * Es diu `of` i no `me`, i el nom hi ha arribat tard.
 *
 * La clau ja prenia un id des del primer dia, però el nom deia que la fila era
 * la teva. Ara la fan servir tres pantalles que llegeixen la d'una altra
 * persona —el perfil públic d'un soci, la fitxa de la junta i el traspàs—, i
 * `profileKeys.me(altreId)` és una frase que es llegeix com un error i no ho
 * és. Mateix parell que `fetchPointsOf`.
 */
export const profileKeys = {
  of: (id: string) => ['profile', id] as const,
}

/**
 * UNA SOLA LLISTA DE COLUMNES PER A QUATRE PANTALLES, i sí, dues no les fa
 * servir tothom: `role` el pinta el rètol de càrrec de la fitxa de la junta i
 * `hide_from_ranking` l'interruptor del teu propi perfil, i el perfil públic
 * d'un soci no en pinta cap dels dos —se'ls baixa igualment quan mires algú
 * altre.
 *
 * L'OPCIÓ DESCARTADA ÉS PARTIR-LA en una llista pública i una de completa. No
 * costa el que sembla i compra menys del que sembla:
 *
 * - Compra res en privadesa. El grant de `profiles` és de tota la taula, o
 *   sigui que qualsevol soci llegeix `hide_from_ranking` de qualsevol altre
 *   amb una petició a mà, demani el que demani aquesta pantalla. Tapar-ho de
 *   debò vol dir treure la columna del grant i tornar-la per una funció
 *   definer, perquè un privilegi de columna no sap dir «només la teva fila»; i
 *   aleshores l'interruptor del teu perfil també hi ha de passar. És una
 *   decisió de migració, no d'aquest `select`.
 * - Costa la cache. Les quatre pantalles comparteixen `profileKeys.of(id)`, i
 *   dues formes sota la mateixa clau vol dir que la primera que arribi decideix
 *   què hi ha. Dues claus per a la mateixa fila és exactament el que la fitxa
 *   de la junta ja va desfer: envellien per separat i canviar-se el nom en
 *   refrescava una.
 *
 * El que la pantalla del soci no ha de dir és el número de punts, i no el diu:
 * `MemberStandingBlock` el treu de `ranking_period()`, que ja deixa fora qui
 * s'amaga.
 */
export async function fetchProfile(id: string): Promise<MyProfile | null> {
  return unwrapMaybe<MyProfile>(
    supabase
      .from('profiles')
      .select(
        'id, nombre, avatar_url, escola, grau, curs, instagram, hide_from_ranking, created_at, estat, role',
      )
      .eq('id', id)
      .maybeSingle(),
  )
}

/**
 * What to call somebody in a greeting.
 *
 * Google gives a full name, and "Bona nit, Roc Bagués i Torrent" reads like a
 * letter from the bank. The first word is close enough and is what everyone
 * calls each other anyway.
 */
export function firstName(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre
}
