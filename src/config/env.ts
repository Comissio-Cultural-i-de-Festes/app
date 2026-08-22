/**
 * The only module that reads `import.meta.env`. Everything here is inlined
 * into the browser bundle at build time, so nothing secret may live here.
 */

function read(key: keyof ImportMetaEnv): string | undefined {
  // ImportMetaEnv from vite/client carries an `any` index signature, so a
  // dynamic key read has to be narrowed here rather than at every call site.
  const value: unknown = import.meta.env[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function required(key: keyof ImportMetaEnv): string {
  const value = read(key)
  if (value === undefined) {
    throw new Error(`Missing ${key}. Copy .env.example to .env and fill it in.`)
  }
  return value
}

function optional(key: keyof ImportMetaEnv, fallback: string): string {
  return read(key) ?? fallback
}

export const env = {
  appName: required('VITE_APP_NAME'),
  appShortName: required('VITE_APP_SHORT_NAME'),
  appDescription: optional('VITE_APP_DESCRIPTION', ''),
  // Shown under the wordmark on the entry screen. Association-specific, so it
  // is configuration, not a translated string.
  appTagline: optional('VITE_APP_TAGLINE', ''),
  // Where "ask for one in the WhatsApp group" points. A group invite link, so
  // it changes without a deploy and does not belong in the bundle as a
  // literal.
  whatsappUrl: optional('VITE_WHATSAPP_URL', ''),
  defaultLocale: optional('VITE_DEFAULT_LOCALE', 'ca'),
  timeZone: optional('VITE_TIME_ZONE', 'Europe/Madrid'),
  supabaseUrl: required('VITE_SUPABASE_URL'),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY'),
} as const
