import { createClient, type PostgrestError } from '@supabase/supabase-js'

import { env } from '@/config/env'

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
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
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
export async function rpc<T>(
  fn: string,
  args?: Record<string, unknown>,
): Promise<{ data: T | null; error: PostgrestError | null }> {
  const res = await supabase.rpc(fn, args)
  return { data: res.data as T | null, error: res.error }
}
