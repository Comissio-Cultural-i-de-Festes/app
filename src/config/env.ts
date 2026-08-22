/**
 * The only module that reads `import.meta.env`. Everything here is inlined
 * into the browser bundle at build time, so nothing secret may live here.
 */

function required(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key]
  if (!value) throw new Error(`Missing ${key}. Copy .env.example to .env and fill it in.`)
  return value
}

function optional(key: keyof ImportMetaEnv, fallback: string): string {
  return import.meta.env[key] || fallback
}

export const env = {
  appName: required('VITE_APP_NAME'),
  appShortName: required('VITE_APP_SHORT_NAME'),
  appDescription: optional('VITE_APP_DESCRIPTION', ''),
  defaultLocale: optional('VITE_DEFAULT_LOCALE', 'ca'),
  timeZone: optional('VITE_TIME_ZONE', 'Europe/Madrid'),
  supabaseUrl: required('VITE_SUPABASE_URL'),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY'),
} as const
