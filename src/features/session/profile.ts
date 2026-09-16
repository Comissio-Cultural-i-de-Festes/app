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
