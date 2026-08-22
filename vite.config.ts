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
] as const

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
          theme_color: env.VITE_THEME_COLOR ?? '#100909',
          background_color: env.VITE_BACKGROUND_COLOR ?? '#100909',
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
          // Precache is build output only — these globs never see anything
          // outside dist/. Fonts are deliberately absent: the browser fetches
          // only the subset it needs and the rule below keeps it forever,
          // which is lighter than precaching every subset at install.
          globPatterns: ['**/*.{js,css,html,png,ico,webmanifest}'],
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
              // Self-hosted fonts, same origin, content-hashed filenames.
              urlPattern: ({ request }: { request: Request }) => request.destination === 'font',
              handler: 'CacheFirst' as const,
              options: {
                cacheName: 'fonts',
                expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
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
    },
  }
})
