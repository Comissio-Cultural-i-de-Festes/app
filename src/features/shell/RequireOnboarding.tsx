import { useState } from 'react'
import { Navigate, Outlet } from 'react-router'

import { PROFILE_CLOCK, needsOnboarding, useMyProfile } from '@/features/session/useMyProfile'
import { useAvailability } from '@/lib/useAvailability'

import { GateWaiting } from './Gate'

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
 *
 * But only while it can still end. Offline the profile query pauses rather
 * than failing, so `isPending` stays true for as long as there is no signal,
 * and on a network that takes requests and never answers it stays true for
 * ever: both left people on «Un segon…» with nothing to press. Past either of
 * those this lets them through, exactly as it already did for a failure — the
 * QR saved on the phone is behind this door, and the screens inside say for
 * themselves that there is no connection. When the profile does arrive and the
 * school is missing, the redirect below still happens.
 */
export function RequireOnboarding() {
  const profile = useMyProfile()
  const { loading } = useAvailability(profile, { clock: PROFILE_CLOCK })
  const [through, setThrough] = useState(false)

  // Un cop oberta, no es torna a tancar. Una consulta fallada torna a «pending»
  // quan qualsevol pantalla de dins la torna a demanar en muntar-se, i tornar a
  // l'espera aquí desmuntava aquella pantalla, que deixava de demanar-la, que
  // la feia fallar, que obria la porta, que tornava a muntar la pantalla: amb
  // el perfil donant 500, «Un segon…» per sempre i una petició cada segon.
  if (!loading && !through) setThrough(true)

  if (loading && !through) return <GateWaiting />

  // A profile that failed to load is not a profile without a school. Letting
  // the app through means an empty home screen with a retry, which is honest;
  // redirecting would put somebody in a form they have already filled in.
  if (!profile.isError && needsOnboarding(profile.data))
    return <Navigate to="/primer-cop" replace />

  return <Outlet />
}
