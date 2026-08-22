import { execFileSync } from 'node:child_process'

import { createClient, type PostgrestError } from '@supabase/supabase-js'

/**
 * The second test layer: the same policies, but reached the way the app
 * reaches them — through Kong and PostgREST, with a real GoTrue token.
 *
 * pgTAP cannot see any of this. A view that forgot `security_invoker` returns
 * exactly the rows these tests expect while also returning them for tables the
 * caller cannot read; conversely a PostgREST embedding leak has no SQL-level
 * signature at all. Neither layer is redundant.
 */

interface StackEnv {
  apiUrl: string
  anonKey: string
  serviceKey: string
}

function fromSupabaseStatus(): StackEnv {
  // Local stack keys only. The hosted service_role key never appears in this
  // repo, in .env.example, or in CI — it bypasses every policy in supabase/.
  const out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  const read = (key: string): string => {
    const m = new RegExp(`^${key}="?([^"\\n\\r]+)"?$`, 'm').exec(out)
    if (!m?.[1]) throw new Error(`${key} not found in \`supabase status\`. Is the stack up?`)
    return m[1]
  }
  return {
    apiUrl: read('API_URL'),
    anonKey: read('ANON_KEY'),
    serviceKey: read('SERVICE_ROLE_KEY'),
  }
}

export const stack: StackEnv =
  process.env.API_URL && process.env.ANON_KEY && process.env.SERVICE_ROLE_KEY
    ? {
        apiUrl: process.env.API_URL,
        anonKey: process.env.ANON_KEY,
        serviceKey: process.env.SERVICE_ROLE_KEY,
      }
    : fromSupabaseStatus()

export const anonClient = () =>
  createClient(stack.apiUrl, stack.anonKey, { auth: { persistSession: false } })

export const serviceClient = () =>
  createClient(stack.apiUrl, stack.serviceKey, { auth: { persistSession: false } })

export type Client = ReturnType<typeof anonClient>

/**
 * PostgREST hands back `any` for an RPC payload. Narrowing it here keeps the
 * cast in one reviewable place instead of scattered through the assertions.
 */
export async function rpc<T>(
  client: Client,
  fn: string,
  args?: Record<string, unknown>,
): Promise<{ data: T | null; error: PostgrestError | null }> {
  const res = await client.rpc(fn, args)
  return { data: res.data as T | null, error: res.error }
}

// GoTrue rate-limits sign-ins. A suite that signs in per test starts failing
// partway through, and the failures move around between runs, which is the
// worst kind of flake to chase.
const sessions = new Map<string, Client>()

export async function as(handle: string): Promise<Client> {
  const cached = sessions.get(handle)
  if (cached) return cached

  const client = createClient(stack.apiUrl, stack.anonKey, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({
    email: `${handle}@example.test`,
    password: 'test-password-0000',
  })
  if (error) throw new Error(`sign-in failed for ${handle}: ${error.message}`)

  sessions.set(handle, client)
  return client
}

/** Fixture ids, written out so an assertion cannot pass because a lookup broke. */
export const F = {
  alfa: '00000000-0000-4000-8000-000000000001',
  bravo: '00000000-0000-4000-8000-000000000002',
  charlie: '00000000-0000-4000-8000-000000000003', // potser on e1
  delta: '00000000-0000-4000-8000-000000000004', // no on e1
  golf: '00000000-0000-4000-8000-000000000007',
  juntaAlfa: '00000000-0000-4000-8000-0000000000a1',
  hidden: '00000000-0000-4000-8000-0000000000b3',
  pendent: '00000000-0000-4000-8000-0000000000b1',
  e1: '00000000-0000-4000-8000-0000000000e1', // published, revealed, free, unlimited
  e2: '00000000-0000-4000-8000-0000000000e2', // published, not yet revealed
  e3: '00000000-0000-4000-8000-0000000000e3', // unpublished
  e4: '00000000-0000-4000-8000-0000000000e4', // published, revealed, places + price
} as const
