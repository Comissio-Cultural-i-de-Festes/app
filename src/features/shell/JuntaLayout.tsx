import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet } from 'react-router'

import { JuntaNav } from '@/features/junta/JuntaNav'
import { isJunta, useMyProfile } from '@/features/session/useMyProfile'
import { errorKey } from '@/lib/errors'

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
 *
 * It is also where the 430-pixel column is released. Everything a member sees
 * keeps it at every width; the junta's three desk screens do not, because
 * going through forty payments in a phone-width column on a laptop is the kind
 * of thing that makes people keep the spreadsheet.
 */
export function JuntaLayout() {
  const { t } = useTranslation()
  const { data: profile, isPending, isError, error, refetch } = useMyProfile()

  // On #root rather than in a component, because the width cap lives on #root
  // and a child cannot widen its own parent.
  useEffect(() => {
    const root = document.getElementById('root')
    root?.setAttribute('data-wide', 'true')
    return () => {
      root?.removeAttribute('data-wide')
    }
  }, [])

  // Deciding while the profile is still in flight would bounce every admin
  // out of the door they just came through.
  if (isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-app">
        <p className="text-fg-muted">{t('state.loading')}</p>
      </main>
    )
  }

  // A profile that failed to load is not a profile that says "not junta".
  // Redirecting on it bounces an admin out of the door they are standing at,
  // on one bar of signal, with nothing on screen to explain why.
  if (isError) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-app px-[var(--ds-gutter)]">
        <p role="alert" className="text-center text-lg font-bold text-error [text-wrap:pretty]">
          {t(errorKey(error))}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="min-h-[44px] px-4 text-md font-bold text-brand-label"
        >
          {t('actions.retry')}
        </button>
      </main>
    )
  }

  if (!isJunta(profile)) return <Navigate to="/" replace />

  return (
    <>
      <JuntaNav />
      <Outlet />
    </>
  )
}
