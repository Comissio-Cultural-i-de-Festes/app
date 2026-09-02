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

    const { data: user } = await supabase.auth.getUser()
    const userId = user.user?.id
    if (userId === undefined) return { ok: false, reason: 'failed' }

    // Upsert per `endpoint`: el navegador rota les claus de tant en tant i el
    // mateix endpoint ha de quedar-se amb les noves, no duplicar-se.
    const { error } = await supabase
      .from('push_subscription')
      .upsert(
        { endpoint: json.endpoint, user_id: userId, p256dh, auth },
        { onConflict: 'endpoint' },
      )
    if (error) return { ok: false, reason: 'failed' }

    return { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
