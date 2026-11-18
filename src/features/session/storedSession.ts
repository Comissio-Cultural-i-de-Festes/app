import { AUTH_STORAGE_KEY } from '@/lib/supabase'

/**
 * De qui és la sessió desada, sense preguntar-ho a ningú.
 *
 * Només per a la porta que no pot obrir la sessió per falta de xarxa. Allà
 * supabase-js no ens dona la sessió —caducada, no la pot renovar— però tampoc
 * l'esborra, i l'identificador de qui hi ha a dins és el que necessita el QR
 * desat al mòbil, que va per persona.
 *
 * NO ÉS ENTRAR. Res d'aquí no fa servir el testimoni ni parla amb el servidor:
 * llegeix un camp d'un JSON que el mateix mòbil va escriure. El QR que se'n
 * treu és el mateix que la pantalla del QR ensenyaria, i ja vivia en aquest
 * `localStorage`.
 */
export interface StoredUser {
  readonly id: string
  readonly name: string | null
}

export function storedUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as {
      user?: { id?: unknown; user_metadata?: { full_name?: unknown; name?: unknown } }
    } | null
    const id = parsed?.user?.id
    if (typeof id !== 'string' || id === '') return null
    const meta = parsed?.user?.user_metadata
    const name = meta?.full_name ?? meta?.name
    return { id, name: typeof name === 'string' && name !== '' ? name : null }
  } catch {
    return null
  }
}
