import { env } from '@/config/env'
import { supabase } from '@/lib/supabase'

/**
 * Subscriure el navegador als avisos de la revelació.
 *
 * EL PERMÍS ES DEMANA QUAN ALGÚ VOL UNA COSA, i mai abans. Un
 * `Notification.requestPermission()` al carregar l'app és el diàleg que la
 * gent tanca sense llegir, i a Chrome i a Safari «denegat» és per sempre: no
 * hi ha manera de tornar a demanar-ho des de la pàgina. Per això això només
 * es crida des del «Sí, avisa'm» que surt DESPRÉS d'haver premut «Avisa'm»,
 * quan la persona ja ha dit que aquell esdeveniment li interessa.
 *
 * I TOT AIXÒ POT FALLAR SENSE QUE PASSI RES. Sense clau VAPID configurada,
 * sense service worker, en un navegador que no en té, amb el permís denegat o
 * amb iOS que no dóna push a una PWA que no s'ha afegit a la pantalla d'inici
 * —en tots els casos la funció torna un motiu i la pantalla no insisteix. El
 * camí és la targeta «Ja es pot dir» de l'Inici; això és la millora.
 *
 * LA CLAU ES CONVERTEIX A BYTES AQUÍ. `applicationServerKey` vol un
 * `Uint8Array` i la clau viatja com a base64url, que no és el base64 que
 * `atob` entén: `-` i `_` en comptes de `+` i `/`, i sense encoixinat. És
 * l'error clàssic d'aquesta API i el símptoma és un `InvalidCharacterError`
 * que no diu res d'això.
 */

export type PushOutcome =
  | { readonly ok: true }
  /** Aquest navegador no en té, o no és una app instal·lada a iOS. */
  | { readonly ok: false; readonly reason: 'unsupported' }
  /** No hi ha clau VAPID configurada: la instal·lació no té push. */
  | { readonly ok: false; readonly reason: 'unconfigured' }
  /** La persona ha dit que no al diàleg del sistema. */
  | { readonly ok: false; readonly reason: 'denied' }
  | { readonly ok: false; readonly reason: 'failed' }

/**
 * Torna un `ArrayBuffer` i no un `Uint8Array`.
 *
 * `applicationServerKey` vol un `BufferSource` amb un `ArrayBuffer` de debò, i
 * `Uint8Array.from(...)` en dóna un de tipus `ArrayBufferLike` —que inclou
 * `SharedArrayBuffer` i per tant no encaixa. Es construeix el búfer primer i
 * s'omple la vista a sobre.
 */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const buffer = new ArrayBuffer(binary.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i)
  return buffer
}

/** Dues claus VAPID, byte a byte: els `ArrayBuffer` no es comparen amb `===`. */
export function sameKey(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  return x.every((byte, i) => byte === y[i])
}

/** Si val la pena ensenyar el bloc que demana el permís. */
export function pushAvailable(): boolean {
  return (
    env.vapidPublicKey !== '' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    // Ja denegat vol dir per sempre des d'aquí: ensenyar el bloc seria oferir
    // una cosa que no es pot tornar a demanar.
    Notification.permission !== 'denied'
  )
}

/** I si ja està subscrit, per no tornar-ho a oferir. */
export function pushGranted(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
    ? Notification.permission === 'granted'
    : false
}

export async function subscribeToPush(): Promise<PushOutcome> {
  if (env.vapidPublicKey === '') return { ok: false, reason: 'unconfigured' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'denied' }

  try {
    // El service worker el registra `vite-plugin-pwa`; això espera que estigui
    // llest en comptes de registrar-ne un segon.
    const registration = await navigator.serviceWorker.ready

    // Reutilitzar la que hi hagi. Un `subscribe` sobre una subscripció
    // existent amb una clau diferent llança, i el navegador pot tenir-ne una
    // d'abans que la clau VAPID canviés.
    const existing = await registration.pushManager.getSubscription()
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        // Obligatori a Chrome: una subscripció que no és visible per a
        // l'usuari es refusa. I és el que volem de totes maneres —cada avís
        // ensenya una notificació.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(env.vapidPublicKey),
      }))

    const json = subscription.toJSON()
    const p256dh = json.keys?.p256dh
    const auth = json.keys?.auth
    if (json.endpoint === undefined || p256dh === undefined || auth === undefined) {
      return { ok: false, reason: 'failed' }
    }

    return saveSubscription(json.endpoint, p256dh, auth)
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Desar-la, per l'RPC i no per la taula.
 *
 * AQUÍ HI VA HAVER UN UPSERT I NO PODIA FUNCIONAR MAI. `push_subscription` no
 * dóna SELECT a `authenticated` —les claus d'una subscripció són la capacitat
 * d'enviar avisos al mòbil de qui la va crear—, i un `on conflict do update`
 * exigeix aquell SELECT perquè Postgres ha de llegir la fila per resoldre el
 * conflicte. Sortia `42501` i aquesta funció el convertia en `failed`. A
 * producció no s'hi va desar cap subscripció mai.
 *
 * La migració 51 hi va posar `save_push_subscription`, que escriu com a
 * `definer` i atribueix la fila a `auth.uid()`. Vegeu-hi la capçalera: la
 * sortida no era donar el SELECT.
 */
async function saveSubscription(
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<PushOutcome> {
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
  })
  if (error) {
    // Es registra. La versió d'abans se'l menjava, i per això un permís
    // concedit amb el desat trencat semblava un èxit durant setmanes.
    console.error('[push] subscripció no desada', error.code, error.message)
    return { ok: false, reason: 'failed' }
  }
  return { ok: true }
}

/**
 * Una subscripció feta amb una clau VAPID que ja no és l'actual.
 *
 * El servei de push la lliga a la clau amb què es va crear, i si la clau es
 * perd o es rota rebutja cada enviament sense que ningú ho vegi: l'app la
 * continuava desant i els avisos deixaven d'arribar a tothom qui s'havia
 * subscrit abans.
 *
 * AMB `options` O `applicationServerKey` NULS NO ES TOCA RES. Alguns
 * navegadors (Safari antic) no la diuen, i sense saber-ho refer-la a cada
 * sessió canviaria l'endpoint de gent que va bé i deixaria una fila morta cada
 * cop. El cost és que una rotació no es cura en aquells navegadors.
 */
function keyIsStale(subscription: PushSubscription): boolean {
  const current = subscription.options?.applicationServerKey
  if (current === null || current === undefined) return false
  return !sameKey(current, urlBase64ToBytes(env.vapidPublicKey))
}

/**
 * Deixar el navegador subscrit amb la clau actual i la subscripció desada.
 *
 * PERQUÈ «PERMÍS CONCEDIT» NO VOL DIR «DESADA». Són dues coses que passen en
 * dos llocs diferents i la segona pot fallar sola: el navegador es queda
 * subscrit i el servidor no en sap res, i com que el permís ja està concedit
 * la pantalla no torna a oferir res. Sense això, aquell navegador no rep un
 * avís mai més i ningú se n'assabenta.
 *
 * És idempotent i barata, i es crida en arrencar i des de la targeta de
 * l'esdeveniment. Amb el permís concedit cura tres casos:
 *   - desada que no va arribar al servidor: es torna a desar;
 *   - clau VAPID anterior (vegeu `keyIsStale`): es refà;
 *   - cap subscripció: es crea en silenci. Passa si una rotació va dessubscriure
 *     i el `subscribe` va fallar sense xarxa, o si iOS l'ha descartada. Sense
 *     això, el permís concedit amagava el problema per sempre.
 *
 * Sense xarxa no es toca res: dessubscriure i no poder tornar a subscriure és
 * pitjor que esperar. La fila de l'endpoint vell no es pot esborrar des del
 * client —`authenticated` no té DELETE a la taula— i queda com a morta.
 *
 * UNA SOLA EXECUCIÓ ALHORA. L'arrencada i la targeta poden córrer a la vegada
 * i un doble unsubscribe/subscribe deixaria una subscripció òrfena.
 */
let inFlight: Promise<boolean> | null = null

export function ensureSubscriptionSaved(): Promise<boolean> {
  inFlight ??= ensure().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function ensure(): Promise<boolean> {
  if (env.vapidPublicKey === '') return false
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  if (!pushGranted()) return false
  if (!navigator.onLine) return false

  try {
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()

    if (subscription !== null && keyIsStale(subscription)) {
      // Dessubscriure abans: un `subscribe` amb una altra clau sobre la vella
      // llança.
      await subscription.unsubscribe()
      subscription = null
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(env.vapidPublicKey),
    })

    const json = subscription.toJSON()
    const p256dh = json.keys?.p256dh
    const auth = json.keys?.auth
    if (json.endpoint === undefined || p256dh === undefined || auth === undefined) {
      return false
    }

    const saved = await saveSubscription(json.endpoint, p256dh, auth)
    return saved.ok
  } catch {
    return false
  }
}
