/*
 * El tros de service worker que rep l'avís de la revelació.
 *
 * PER QUÈ ÉS UN FITXER A `public/` I NO CODI DE L'APP. El PWA es genera amb
 * `registerType: 'autoUpdate'` i un bloc `workbox`, que és l'estratègia
 * `generateSW`: Workbox escriu el service worker sencer i no hi ha cap lloc on
 * posar-hi un `addEventListener` propi. L'alternativa era passar a
 * `injectManifest`, que vol dir escriure i mantenir tot el service worker
 * —precaching, rutes, neteja de memòries cau velles, el `NetworkOnly` que
 * protegeix la revelació— per afegir-hi vint línies. `workbox.importScripts`
 * l'enganxa al que Workbox ja genera.
 *
 * Va a `public/` perquè s'ha de servir tal com és, des de l'arrel i amb el seu
 * nom: `importScripts` és una ruta que el service worker resol en temps
 * d'execució, no una importació que el `bundler` pugui reescriure.
 *
 * NO ES POT FER GAIRE COSA MÉS QUE ENSENYAR-HO. `showNotification` és
 * obligatori: si un `push` arriba i el service worker no mostra res, el
 * navegador ho compta com un avís silenciós i, després d'uns quants, revoca el
 * permís. Per això el `catch` també n'ensenya una.
 */

/* global self, clients */

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let data = {}
      try {
        data = event.data ? event.data.json() : {}
      } catch {
        /* Un cos que no és JSON. S'ensenya l'avís genèric i prou. */
      }

      const titol = typeof data.titol === 'string' && data.titol !== '' ? data.titol : null
      const url = typeof data.url === 'string' && data.url !== '' ? data.url : '/'

      await self.registration.showNotification(titol ?? 'comi.', {
        // El cos no repeteix el títol: a la safata del telèfon el títol ja hi
        // és en negreta, i dir-lo dues vegades gasta l'única línia que queda.
        body: titol === null ? 'Ja es pot dir.' : 'Ja es pot dir. Toca per veure-ho.',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        // Un avís per esdeveniment: si n'arriben dos —un reintent, dues
        // pestanyes— el segon reemplaça el primer en comptes d'apilar-se.
        tag: typeof data.event_id === 'string' ? `reveal-${data.event_id}` : 'reveal',
        renotify: false,
        data: { url },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data && event.notification.data.url

  event.waitUntil(
    (async () => {
      // Si l'app ja és oberta, s'hi va en comptes d'obrir-ne una segona: dues
      // còpies de la mateixa PWA són dues sessions i, a iOS, dos
      // emmagatzematges.
      const open = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of open) {
        if ('focus' in client) {
          if (target && 'navigate' in client) {
            try {
              await client.navigate(target)
            } catch {
              /* Una navegació refusada no ha de deixar la finestra sense focus. */
            }
          }
          return client.focus()
        }
      }
      if (target) await clients.openWindow(target)
    })(),
  )
})
