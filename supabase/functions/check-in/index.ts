// Deno / Supabase Edge Functions. Not part of the Vite app: it has its own
// runtime and its own toolchain, and is excluded from the app's tsconfig and
// ESLint config.
import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * The HTTP wrapper around public.check_in().
 *
 * It is deliberately thin, because the transaction is not here. Chaining
 * supabase.from(...) calls would be several transactions: die between marking
 * the attendance and writing the points and the person is through the door
 * with nothing to show for it. All of that lives in one plpgsql function, and
 * this is the authenticated door to it.
 *
 * THERE IS NO SERVICE ROLE KEY IN THIS FILE, and that is the design.
 * public.check_in() is SECURITY DEFINER: it is the escalation, it does exactly
 * one thing, and the database enforces the contract. Putting a service-role
 * client here would replace that narrow contract with an unrestricted
 * credential guarded only by the TypeScript below, so a parsing bug would
 * become total database compromise instead of one bad check-in.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'http://127.0.0.1:5173'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

interface ScanRequest {
  event_id: string
  qr_token?: string
  user_id?: string
  client_request_id: string
  entry_photo_url?: string
}

const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

function parseScan(raw: unknown): ScanRequest | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (!isUuid(o.event_id) || !isUuid(o.client_request_id)) return null
  // Exactly one of the two ways to identify a person: a scanned QR, or a name
  // picked from the roster for a manual add.
  if (isUuid(o.qr_token) === isUuid(o.user_id)) return null
  return {
    event_id: o.event_id,
    client_request_id: o.client_request_id,
    ...(isUuid(o.qr_token) ? { qr_token: o.qr_token } : {}),
    ...(isUuid(o.user_id) ? { user_id: o.user_id } : {}),
    ...(typeof o.entry_photo_url === 'string' ? { entry_photo_url: o.entry_photo_url } : {}),
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { status: 'bad_request' })

  const authz = req.headers.get('Authorization') ?? ''
  if (!/^bearer /i.test(authz)) return json(401, { status: 'no_session' })
  const jwt = authz.slice(7).trim()

  // Scoped to the caller. Every policy still applies to everything it does.
  const supa = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  // Authentication. getUser() goes to GoTrue rather than just reading the
  // token, so a signed-out, deleted or banned account is rejected even while
  // its JWT is still inside its lifetime.
  //
  // config.toml also sets verify_jwt on this function, which is worth having —
  // it sheds unauthenticated noise at the gateway before the function boots —
  // but it is not the authorisation check and cannot be. It proves there is a
  // user, not that the user is on the junta, and with legacy keys the anon key
  // is itself a valid JWT that ships in the browser bundle.
  const { data: auth, error: authErr } = await supa.auth.getUser(jwt)
  if (authErr || !auth?.user?.id) return json(401, { status: 'no_session' })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(422, { status: 'bad_request' })
  }

  const scan = parseScan(body)
  if (!scan) return json(422, { status: 'bad_request' })

  // The whole operation, in one transaction, authorised inside the database.
  // Note what is NOT passed: who is scanning. check_in() takes the actor from
  // auth.uid(), so attribution cannot be forged from out here.
  const { data, error } = await supa.rpc('check_in', {
    p_event_id: scan.event_id,
    p_qr_token: scan.qr_token ?? null,
    p_user_id: scan.user_id ?? null,
    p_client_request_id: scan.client_request_id,
    p_entry_photo_url: scan.entry_photo_url ?? null,
  })

  if (error) {
    // Structured, and carrying no names, tokens or photo paths.
    console.error(JSON.stringify({ evt: 'checkin_failed', actor: auth.user.id, code: error.code }))
    // 42501 is check_in() refusing a non-admin.
    return json(error.code === '42501' ? 403 : 500, { status: 'error' })
  }

  return json(200, data)
})
