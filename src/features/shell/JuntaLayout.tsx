import { useTranslation } from 'react-i18next'
import { Navigate, Outlet } from 'react-router'

import { isJunta, useMyProfile } from '@/features/session/useMyProfile'

/**
 * The junta area.
 *
 * No tab bar: these screens are a place you go into and come back out of, and
 * every one of them draws its own way out — "‹ Junta", "Deixa-ho", a cross.
 *
 * The guard here is not the security boundary. Row-level security is, and it
 * holds whatever this component does: a member who types /junta into the bar
 * gets empty lists and 42501s from every write. This exists so that what they
 * get instead is the home screen, because a screen full of empty panels and
 * silent failures reads as "the app is broken" rather than "this is not for
 * you".
 */
export function JuntaLayout() {
  const { t } = useTranslation()
  const { data: profile, isPending } = useMyProfile()

  // Deciding while the profile is still in flight would bounce every admin
  // out of the door they just came through.
  if (isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-app">
        <p className="text-fg-muted">{t('state.loading')}</p>
      </main>
    )
  }

  if (!isJunta(profile)) return <Navigate to="/" replace />

  return <Outlet />
}
