/**
 * Preview-only stand-in for src/config/env.ts.
 *
 * The real module reads `import.meta.env` and THROWS on a missing key. The
 * design-sync bundle is an IIFE with no import.meta and no .env, so the real
 * module would take the whole `window.AppComi` global down at load. This stub
 * is wired in through `.design-sync/tsconfig.sync.json` paths — it exists only
 * in the sync build; the app never sees it.
 *
 * The display strings are the real association's, so preview cards read the
 * way the app does. The Supabase values are deliberately fake: previews render
 * statically and must never reach a real project.
 */
export const env = {
  appName: 'Comissió Cultural i de Festes del TecnoCampus',
  appShortName: 'comi.',
  appDescription: 'Esdeveniments, check-in, punts i rànquings de la comi',
  appTagline: 'TecnoCampus Mataró',
  whatsappUrl: '',
  defaultLocale: 'ca',
  timeZone: 'Europe/Madrid',
  authEmailFallback: false,
  entryPhoto: false,
  supabaseUrl: 'https://design-preview.invalid',
  supabaseAnonKey: 'design-preview-anon-key',
} as const
