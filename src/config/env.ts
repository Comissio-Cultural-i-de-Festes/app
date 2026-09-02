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

function flag(key: keyof ImportMetaEnv): boolean {
  return read(key) === 'true'
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
  /**
   * Bring back signing in by email, with the six-digit code.
   *
   * Off, because without an association domain there is no verified sender and
   * the built-in SMTP allows two messages an hour — a hundred sign-ups in one
   * evening is not going to happen through it.
   *
   * It stays switchable rather than deleted for two reasons. If a domain ever
   * gets bought this is how it comes back, and more urgently: if the OAuth
   * round trip turns out not to return to an installed app on iOS, this is the
   * only way anybody signs in from the home-screen icon. See the iPhone check
   * in the README.
   */
  authEmailFallback: flag('VITE_AUTH_EMAIL_FALLBACK'),
  supabaseUrl: required('VITE_SUPABASE_URL'),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY'),
  /**
   * La clau PÚBLICA de VAPID, per subscriure el navegador als avisos.
   *
   * Pública de debò: el navegador l'ha d'enviar al servei de push i va al
   * paquet, com la clau `anon`. La privada, que és la que signa, viu com a
   * secret de l'Edge Function i no apareix mai per aquí —`npm run check:keys`
   * escaneja el build i la trobaria.
   *
   * `optional` i no `required`: sense clau no hi ha avisos i l'app funciona
   * igual. La targeta «Ja es pot dir» de l'Inici és el camí i el push l'extra,
   * o sigui que una instal·lació sense configurar-ho ha d'arrencar i no petar.
   */
  vapidPublicKey: optional('VITE_VAPID_PUBLIC_KEY', ''),
} as const
