import { useTranslation } from 'react-i18next'
import { Navigate, Outlet } from 'react-router'

import { needsOnboarding, useMyProfile } from '@/features/session/useMyProfile'

/**
 * Nobody gets past the door without a school.
 *
 * A wrapper route rather than a redirect inside each screen: there is one
 * place to get it right, and a screen reached by a shared link is covered as
 * well as the home screen is.
 *
 * The wait matters. Redirecting while the profile is still in flight would
 * send everybody to the first-run questions for a moment on every cold start,
 * which is both wrong and unpleasant to look at.
 */
export function RequireOnboarding() {
  const { t } = useTranslation()
  const { data: profile, isPending, isError } = useMyProfile()

  if (isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-app">
        <p className="text-fg-muted">{t('state.loading')}</p>
      </main>
    )
  }

  // A profile that failed to load is not a profile without a school. Letting
  // the app through means an empty home screen with a retry, which is honest;
  // redirecting would put somebody in a form they have already filled in.
  if (!isError && needsOnboarding(profile)) return <Navigate to="/primer-cop" replace />

  return <Outlet />
}
