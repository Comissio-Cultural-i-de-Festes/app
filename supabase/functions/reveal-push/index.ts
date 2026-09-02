// Deno / Supabase Edge Functions. Not part of the Vite app: it has its own
// runtime and its own toolchain, and is excluded from the app's tsconfig and
// ESLint config.
import webpush from 'npm:web-push@3.6.7'

/**
 * L'avís del mòbil, el dia que un esdeveniment es revela.
 *
 * NO TÉ CAP CLAU DE BASE DE DADES, i això és el disseny. `check-in/index.ts`
 * explica el principi: una credencial sense límits guardada darrere d'un
 * parser de TypeScript converteix un error de parsing en compromís total.
 * Aquesta funció ho porta un pas més enllà —no hi ha ni client de Supabase.
 *
 * La base de dades decideix i aquesta funció xifra i envia. `pg_cron` munta el
 * missatge sencer *i la llista de subscripcions* (migració 47,
 * `private.reveal_push_payload`) i els envia al cos de la petició. Aquí no es
 * pot preguntar qui és ningú ni quins esdeveniments hi ha. Si algú
 * aconseguís cridar-la, el màxim que pot fer és enviar el que porti al cos.
 *
 * PER QUÈ NO ES XIFRA A MÀ. Web Push vol un JWT VAPID signat amb ECDSA P-256 i
 * el cos xifrat amb AES128GCM sobre ECDH + HKDF. Escriure això a mà és
 * criptografia pròpia en un camí que no té cap test que pugui dir que va
 * malament: si es xifra mal, el navegador descarta el missatge en silenci i el
 * símptoma és «no arriben els avisos». `web-push` és la implementació de
 * referència i és la que fa servir tothom.
 *
 * EL TOKEN, I PER QUÈ NO N'HI HA PROU AMB EL JWT DE SUPABASE. La clau `anon`
 * és pública —és al paquet del navegador— o sigui que `verify_jwt` no
 * distingeix el nostre cron d'un desconegut. El que ho distingeix és un secret
 * compartit que només són a `vault` i a l'entorn d'aquesta funció.
 */

const TOKEN = Deno.env.get('REVEAL_PUSH_TOKEN')
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:junta@example.invalid'
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'http://127.0.0.1:5173'

interface Subscription {
  endpoint: string
  p256dh: string
  auth: string
}

interface Payload {
  event_id: string
  titol: string
  quan: string
  url: string
  subscripcions: Subscription[]
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

const isSub = (v: unknown): v is Subscription => {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.endpoint === 'string' &&
    o.endpoint.startsWith('https://') &&
    typeof o.p256dh === 'string' &&
    typeof o.auth === 'string'
  )
}

function parse(raw: unknown): Payload | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (!isUuid(o.event_id)) return null
  if (typeof o.titol !== 'string' || o.titol.trim() === '') return null
  if (typeof o.url !== 'string' || !o.url.startsWith('/')) return null
  if (!Array.isArray(o.subscripcions) || !o.subscripcions.every(isSub)) return null

  return {
    event_id: o.event_id,
    titol: o.titol,
    quan: typeof o.quan === 'string' ? o.quan : '',
    url: o.url,
    subscripcions: o.subscripcions,
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { error: 'method' })

  // Cap CORS. Això no es crida des d'un navegador mai: el que la crida és
  // `pg_net` des de dins de la base. Posar-hi capçaleres de CORS seria
  // convidar-hi el navegador.
  if (TOKEN === undefined || TOKEN === '') {
    return json(503, { error: 'not configured' })
  }
  if (req.headers.get('x-reveal-token') !== TOKEN) {
    return json(401, { error: 'token' })
  }
  if (VAPID_PUBLIC === undefined || VAPID_PRIVATE === undefined) {
    return json(503, { error: 'no vapid keys' })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json(400, { error: 'body' })
  }

  const payload = parse(raw)
  if (payload === null) return json(400, { error: 'payload' })

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

  // El que el service worker rebrà. Curt a posta: un avís de push es llegeix
  // en una notificació de dues línies, i el que hi ha de dur és el títol i on
  // porta en tocar-lo.
  const body = JSON.stringify({
    titol: payload.titol,
    url: `${APP_ORIGIN}${payload.url}`,
    quan: payload.quan,
  })

  // Cada subscripció pel seu compte i cap error que aturi la resta: un
  // endpoint caducat és el cas normal —iOS els descarta al cap d'unes
  // setmanes— i no ha de fer que la resta de la gent es quedi sense avís.
  const results = await Promise.allSettled(
    payload.subscripcions.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { TTL: 24 * 60 * 60 },
      ),
    ),
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  // Els 404 i 410 són subscripcions mortes. No es netegen des d'aquí perquè
  // per fer-ho caldria escriure a la base, que és exactament el que aquesta
  // funció no pot fer; el client les substitueix tot sol la propera vegada que
  // s'hi subscriu.
  const gone = results.filter(
    (r) =>
      r.status === 'rejected' &&
      typeof (r.reason as { statusCode?: number }).statusCode === 'number' &&
      [404, 410].includes((r.reason as { statusCode: number }).statusCode),
  ).length

  return json(200, { sent, gone, total: payload.subscripcions.length })
})
