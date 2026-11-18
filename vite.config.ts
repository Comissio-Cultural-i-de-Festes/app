import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

const REQUIRED_ENV = [
  'VITE_APP_NAME',
  'VITE_APP_SHORT_NAME',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  // Sense ell, l'HTML enviava el marcador literal i el color era invàlid. Amb
  // `display: standalone` la banda de dalt es pinta a partir d'aquest valor,
  // o sigui que un color invàlid és una banda que no és la que toca.
  'VITE_THEME_COLOR',
] as const

/** El de `--ds-bg-app`. També el del manifest, i el mateix a tots dos llocs. */
const FALLBACK_COLOR = '#100909'

const escapeAttribute = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  const missing = REQUIRED_ENV.filter((key) => !env[key])
  if (missing.length > 0) {
    const message = `Missing env vars: ${missing.join(', ')}. Copy .env.example to .env.`
    // A missing value would otherwise ship as a literal %VITE_APP_NAME% in the
    // title bar, so a release build refuses rather than producing that.
    if (command === 'build') throw new Error(message)
    console.warn(`\n[app-comi] ${message}\n`)
  }

  // Everything Supabase serves — PostgREST, GoTrue, Realtime, Storage and Edge
  // Functions — sits on this one origin.
  //
  // This has to become a RegExp, not an arrow function. Workbox serialises a
  // function urlPattern into sw.js verbatim, so a closure over a build-time
  // variable arrives as an undefined identifier and the whole worker dies with
  // a ReferenceError before it registers a single route. A RegExp serialises
  // with its value inlined.
  const supabaseOrigin = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).origin : ''
  // An origin is scheme://host[:port]; the only regex-special character it can
  // contain is the dot.
  const supabasePattern = new RegExp(`^${supabaseOrigin.split('.').join('\\.')}/`)

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // La substitució de `%VITE_*%` que fa Vite deixa el marcador tal qual
        // quan la variable no hi és, i aleshores `content="%VITE_THEME_COLOR%"`
        // és un color invàlid. El manifest ja tenia xarxa de seguretat i l'HTML
        // no; ara la comparteixen.
        name: 'app-comi:theme-color',
        transformIndexHtml(html: string) {
          return html.replaceAll('%VITE_THEME_COLOR%', env.VITE_THEME_COLOR || FALLBACK_COLOR)
        },
      },
      {
        // `og:image` ha de ser una URL absoluta: WhatsApp i Facebook no
        // resolen la relativa contra la pàgina. L'origen no surt de res de
        // l'HTML estàtic, així que ve de VITE_SITE_URL. Buida, no fa petar el
        // build: cau a la ruta relativa, que és pitjor per als rastrejadors
        // però millor que un marcador literal.
        //
        // La descripció cau al nom si no n'hi ha: un `og:description` buit fa
        // que alguns rastrejadors se n'inventin una a partir de la pàgina.
        name: 'app-comi:link-preview',
        transformIndexHtml(html: string) {
          const site = (env.VITE_SITE_URL ?? '').trim().replace(/\/+$/, '')
          const description = env.VITE_APP_DESCRIPTION || env.VITE_APP_NAME || ''
          return html
            .replaceAll('%OG_IMAGE_URL%', `${site}/og-image.png`)
            .replaceAll('%OG_DESCRIPTION%', escapeAttribute(description))
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null, // registered explicitly in src/lib/pwa.ts
        includeAssets: ['favicon.png', 'apple-touch-icon.png'],
        manifest: {
          id: '/',
          // A manifest holds one name, so it is the Catalan one.
          name: env.VITE_APP_NAME,
          short_name: env.VITE_APP_SHORT_NAME,
          description: env.VITE_APP_DESCRIPTION ?? '',
          lang: env.VITE_DEFAULT_LOCALE ?? 'ca',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          // `||` i no `??`: dotenv torna una cadena BUIDA per a un valor sense
          // cometes que comenci per `#` —ho avisa el propi .env.example— i `??`
          // només atrapa null i undefined.
          theme_color: env.VITE_THEME_COLOR || FALLBACK_COLOR,
          background_color: env.VITE_BACKGROUND_COLOR || FALLBACK_COLOR,
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // El tros de service worker que rep l'avís de la revelació.
          //
          // `generateSW` —que és el que aquest bloc `workbox` tria— escriu el
          // service worker sencer i no deixa cap lloc on posar un
          // `addEventListener('push')` propi. L'alternativa era `injectManifest`,
          // o sigui escriure i mantenir tot el service worker (precaching,
          // rutes, neteja de memòries cau, el `NetworkOnly` que protegeix la
          // revelació) per afegir-hi vint línies. `importScripts` l'enganxa al
          // que Workbox ja genera.
          //
          // El fitxer viu a `public/` perquè aquesta ruta la resol el service
          // worker en temps d'execució: no és una importació que el bundler
          // pugui reescriure, i per tant el nom no pot portar hash.
          importScripts: ['push.js'],

          // Precache is build output only — these globs never see anything
          // outside dist/. Fonts are deliberately absent: the browser fetches
          // only the subset it needs and the rule below keeps it forever,
          // which is lighter than precaching every subset at install.
          globPatterns: ['**/*.{js,css,html,png,ico,webmanifest}'],
          // Només la veuen els rastrejadors dels enllaços; un soci no la baixa
          // mai i al precache seria pes mort a cada instal·lació.
          globIgnores: ['og-image.png'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/_/, /\/[^/?]+\.[^/]+$/],

          runtimeCaching: [
            // ───────────────────────────────────────────────────────────────
            //  Time-scheduled content. Registered FIRST because Workbox
            //  matches routes in registration order, so this shadows anything
            //  a future commit appends.
            //
            //  Strictly speaking Workbox already caches nothing cross-origin
            //  without a rule, so this is redundant today. It is here because
            //  the redundancy is invisible: six months from now somebody adds
            //  a StaleWhileRevalidate for /rest/v1/* labelled "offline
            //  support" and quietly breaks the reveal.
            //
            //  NetworkOnly, not NetworkFirst. NetworkFirst still writes a copy
            //  into Cache Storage and serves it when offline — and that copy
            //  is exactly the pre-reveal snapshot that must never be shown.
            //  Failing loudly lets the UI render an honest offline state.
            //
            //  Second reason, independent of the reveal: these responses are
            //  authenticated. /auth/v1/token carries refresh tokens, and Cache
            //  Storage is readable by any script on the origin and outlives
            //  sign-out.
            // ───────────────────────────────────────────────────────────────
            ...(supabaseOrigin
              ? [{ urlPattern: supabasePattern, handler: 'NetworkOnly' as const }]
              : []),
            {
              // The QR decoder's wasm. Deliberately absent from the precache
              // globs — a megabyte at install for two hundred members who will
              // never open the scanner — and kept forever once the door has
              // fetched it, because the second time the door is opened there
              // is usually no signal left to fetch it with.
              urlPattern: /\.wasm$/,
              handler: 'CacheFirst' as const,
              options: {
                cacheName: 'wasm',
                expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Self-hosted fonts, same origin, content-hashed filenames.
              urlPattern: ({ request }: { request: Request }) => request.destination === 'font',
              handler: 'CacheFirst' as const,
              options: {
                cacheName: 'fonts',
                expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Els trossos que no són a la precache: la zona de junta, la porta
              // i el mapa. Porten hash al nom i no canvien mai, així que el que
              // s'ha baixat un cop serveix sense xarxa per sempre, que és el que
              // la porta necessita. La ruta de la precache es registra abans, i
              // el que hi és no arriba mai aquí.
              //
              // Funció i no RegExp, i sense res de fora: Workbox l'escriu tal
              // qual a sw.js (vegeu el comentari de `supabaseOrigin`).
              urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
                sameOrigin &&
                url.pathname.startsWith('/assets/') &&
                /\.(?:js|css)$/.test(url.pathname),
              handler: 'CacheFirst' as const,
              options: {
                cacheName: 'chunks',
                // Un build en fa una cinquantena; n'hi caben uns quants
                // seguits, i els vells marxen primer. L'edat és la de les altres
                // regles: amb `CacheFirst` caducar vol dir tornar a la xarxa, i
                // a la porta no n'hi ha.
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                  purgeOnQuotaError: true,
                },
                cacheableResponse: { statuses: [200] },
                plugins: [
                  {
                    // Cloudflare Pages respon `index.html` amb un 200 a qualsevol
                    // camí que no existeix, també a un tros d'un desplegament
                    // anterior. Guardar-lo amb el nom del tros seria guardar una
                    // pàgina on hi havia d'haver codi.
                    cacheWillUpdate: ({ response }: { response: Response }) =>
                      Promise.resolve(
                        response.headers.get('content-type')?.includes('text/html')
                          ? null
                          : response,
                      ),
                  },
                ],
              },
            },
          ],
        },
        devOptions: { enabled: false, type: 'module' },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { host: true, port: 5173 },
    build: { sourcemap: true },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
      // tests/rls needs a running Supabase stack, so it has its own config and
      // its own script. `npm test` must work with nothing but node_modules.
      exclude: ['tests/rls/**'],
      // And it has to work with nothing but node_modules, which means not
      // reading anybody's .env. Two reasons, and the second is the one that
      // bites: config/env.ts throws on a missing VITE_APP_NAME, so on a fresh
      // clone and on CI every suite that transitively imports it fails to load
      // at all — and the time zone is read from configuration, so the date
      // tests would quietly assert whatever zone the person running them has
      // set rather than the association's.
      //
      // Obviously synthetic values, same rule as the database fixtures: no
      // real association, no real campus, no real key.
      env: {
        VITE_APP_NAME: 'Associació de Proves',
        VITE_APP_SHORT_NAME: 'proves.',
        VITE_APP_DESCRIPTION: 'Fixture',
        VITE_APP_TAGLINE: 'Campus Alfa',
        VITE_WHATSAPP_URL: 'https://example.test/grup',
        VITE_DEFAULT_LOCALE: 'ca',
        VITE_TIME_ZONE: 'Europe/Madrid',
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_ANON_KEY: 'fixture-anon-key',
      },
    },
  }
})
