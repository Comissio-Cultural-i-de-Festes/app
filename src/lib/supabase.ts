import { createClient, type PostgrestError } from '@supabase/supabase-js'

import { env } from '@/config/env'

import type { Database } from './database.types'

/**
 * The browser client. The anon key is public by design — it ships in this
 * bundle and is visible in devtools. Row Level Security is the boundary.
 *
 * PKCE is kept (the supabase-js default) rather than the implicit flow: it
 * keeps tokens out of the URL fragment and out of browser history. The cost is
 * that the code verifier lives in this context's storage, so a magic link
 * requested here and opened somewhere else cannot complete — which on iOS is
 * not a corner case, it is the normal path. See features/entry: the same email
 * also carries a six-digit code, and that is what covers it.
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

/**
 * PostgREST types an RPC payload as `any`. Narrowing it here keeps the cast in
 * one reviewable place rather than scattered through the screens.
 */
type Fn = keyof Database['public']['Functions']

export async function rpc<T>(
  fn: Fn,
  // The generated Args types are per-function and cannot be expressed for a
  // generic wrapper, so the payload is checked by Postgres rather than here.
  // The function NAME is checked, which is the half that gets misspelled.
  args?: Record<string, unknown>,
): Promise<{ data: T | null; error: PostgrestError | null }> {
  const res = await supabase.rpc(fn, args as never)
  return { data: res.data as T | null, error: res.error }
}
