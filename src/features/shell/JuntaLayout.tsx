import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation, useMatch } from 'react-router'

import { preloadDoor } from '@/features/door/preload'
import { JuntaNav } from '@/features/junta/JuntaNav'
import { PROFILE_CLOCK, isJunta, useMyProfile } from '@/features/session/useMyProfile'
import { useAvailability } from '@/lib/useAvailability'

import { GateUnreachable, GateWaiting } from './Gate'
import { JuntaScreenBoundary } from './JuntaScreenBoundary'
import { JuntaStrings } from './JuntaStrings'
import { prefetchJunta } from './startPrefetch'

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
  const { pathname } = useLocation()
  const lobby = useMatch({ path: '/junta', end: true })
  const client = useQueryClient()
  const juntaProfile = isJunta(profile.data)

  // Només al rebedor. Les altres pantalles de la zona no el necessiten, i
  // l'escàner té la cua `SCANS` competint per la mateixa barra de cobertura.
  // Quan s'hi entra des d'una altra pantalla el perfil ja hi és, però les
  // dades de l'entrada encara no. En arrencada en fred ja les ha demanat la
  // porta de fora, i això no fa res (la cau les té o ja hi són en vol).
  const atLobby = lobby !== null
  useEffect(() => {
    if (juntaProfile && atLobby) void prefetchJunta(client)
  }, [client, juntaProfile, atLobby])

  // On #root rather than in a component, because the width cap lives on #root
  // and a child cannot widen its own parent.
  useEffect(() => {
    const root = document.getElementById('root')
    root?.setAttribute('data-wide', 'true')
    return () => {
      root?.removeAttribute('data-wide')
    }
  }, [])

  // Aquí i no al rebedor: s'hi pot entrar per qualsevol pantalla de la zona, i
  // el que importa és que la porta quedi baixada abans de ser-hi. El perquè és
  // a `preload.ts`.
  useEffect(() => {
    if (juntaProfile) void preloadDoor()
  }, [juntaProfile])

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
  if (view.unavailable && scanner === null) {
    return <GateUnreachable message={t(view.messageKey)} onRetry={view.retry} />
  }

  // Cada pantalla, dins de la seva xarxa: una d'escriptori que no és al mòbil,
  // sense cobertura, ho diu aquí i no recarrega. El perquè, al fitxer.
  const screen = (
    <JuntaScreenBoundary key={pathname}>
      <JuntaStrings>
        <Outlet />
      </JuntaStrings>
    </JuntaScreenBoundary>
  )

  if (view.unavailable) return screen

  if (!juntaProfile) return <Navigate to="/" replace />

  return (
    <>
      <JuntaNav />
      {screen}
    </>
  )
}
