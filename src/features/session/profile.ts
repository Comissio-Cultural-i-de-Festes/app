import type { Escola } from '@/lib/model'
import { unwrapMaybe } from '@/lib/db'
import { supabase } from '@/lib/supabase'

export interface MyProfile {
  readonly id: string
  readonly nombre: string
  readonly avatar_url: string | null
  readonly escola: Escola | null
  readonly estat: 'pendent' | 'actiu' | 'baixa'
  readonly role: 'member' | 'admin' | 'owner'
}

export const profileKeys = {
  me: (id: string) => ['profile', id] as const,
}

export async function fetchProfile(id: string): Promise<MyProfile | null> {
  return unwrapMaybe<MyProfile>(
    supabase
      .from('profiles')
      .select('id, nombre, avatar_url, escola, estat, role')
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
