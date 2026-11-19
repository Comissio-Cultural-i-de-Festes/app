import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useMatch } from 'react-router'

import { JuntaNav } from '@/features/junta/JuntaNav'
import { PortesRecordadesBlock } from '@/features/junta/PortesRecordadesBlock'
import { PROFILE_CLOCK, isJunta, useMyProfile } from '@/features/session/useMyProfile'
import { useAvailability } from '@/lib/useAvailability'

import { GateUnreachable, GateWaiting } from './Gate'

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
  const profile = useMyProfile()
  const view = useAvailability(profile, { clock: PROFILE_CLOCK })
  const scanner = useMatch('/junta/escaner/:eventId')
  const alta = useMatch('/junta/alta/:eventId')

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
  if (view.loading) return <GateWaiting />

  // A profile that failed to load is not a profile that says "not junta".
  // Redirecting on it bounces an admin out of the door they are standing at,
  // on one bar of signal, with nothing on screen to explain why. The same goes
  // for one that never arrived: offline the query pauses instead of failing,
  // and this used to wait on it for ever.
  //
  // L'escàner és l'excepció. Funciona sense xarxa —cada lectura va a la cua
  // `SCANS` abans de sortir i el servidor la valida quan arriba—, i la porta
  // de la casa rural és exactament on la junta l'obrirà sense cobertura i
  // amb el perfil sense carregar. Aquí no es decideix res de seguretat: qui no
  // és de la junta i hi arriba veu una càmera, i cada lectura que envia la
  // refusa el servidor.
  //
  // L'alta pel nom, pel mateix motiu: és l'altra eina de la porta, i quan torna
  // la xarxa carrega la llista sola. Sense, ella mateixa diu que no hi ha xarxa.
  //
  // I la pantalla que diu que no hi ha xarxa ofereix l'escàner de les portes
  // desades l'últim cop: en fred, sense el perfil ni la porta, és l'únic camí
  // que no passa per escriure'n l'adreça.
  if (view.unavailable && scanner === null && alta === null) {
    return (
      <GateUnreachable message={t(view.messageKey)} onRetry={view.retry}>
        <PortesRecordadesBlock className="mt-6 max-w-[430px]" />
      </GateUnreachable>
    )
  }

  if (view.unavailable) return <Outlet />

  if (!isJunta(profile.data)) return <Navigate to="/" replace />

  return (
    <>
      <JuntaNav />
      <Outlet />
    </>
  )
}
