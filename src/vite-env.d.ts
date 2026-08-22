/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string
  readonly VITE_APP_SHORT_NAME: string
  readonly VITE_APP_DESCRIPTION?: string
  readonly VITE_THEME_COLOR?: string
  readonly VITE_BACKGROUND_COLOR?: string
  readonly VITE_DEFAULT_LOCALE?: string
  readonly VITE_TIME_ZONE?: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
