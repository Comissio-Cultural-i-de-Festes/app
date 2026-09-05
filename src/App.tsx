import type { Session } from '@supabase/supabase-js'
import { Suspense, lazy, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes } from 'react-router'

import { EntryScreen } from '@/features/entry/EntryScreen'
import { EventScreen } from '@/features/event/EventScreen'
import { HomeScreen } from '@/features/home/HomeScreen'
import { InsideScreen } from '@/features/event/InsideScreen'
import { DiptychScreen } from '@/features/photos/DiptychScreen'
import { DoorPhotoScreen } from '@/features/photos/DoorPhotoScreen'
import { IdeasScreen } from '@/features/proposals/IdeasScreen'
import { NewIdeaScreen } from '@/features/proposals/NewIdeaScreen'
import { MyRideScreen } from '@/features/rides/MyRideScreen'
import { OfferRideScreen } from '@/features/rides/OfferRideScreen'
import { RidesScreen } from '@/features/rides/RidesScreen'
import { useCheckinQueue } from '@/features/checkin/useCheckinQueue'
import { RankingScreen } from '@/features/ranking/RankingScreen'
import { UserIdContext } from '@/features/session/context'
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen'
import { BadgesScreen } from '@/features/badges/BadgesScreen'
import { GalleryScreen } from '@/features/gallery/GalleryScreen'
import { ProvesScreen } from '@/features/gimcana/ProvesScreen'
import { ScoreboardScreen } from '@/features/gimcana/ScoreboardScreen'
import { SubmitScreen } from '@/features/gimcana/SubmitScreen'
import { EditProfileScreen } from '@/features/profile/EditProfileScreen'
import { ProfileScreen } from '@/features/profile/ProfileScreen'
import { QrScreen } from '@/features/qr/QrScreen'
import { JuntaLayout } from '@/features/shell/JuntaLayout'
import { RequireOnboarding } from '@/features/shell/RequireOnboarding'
import { TabLayout } from '@/features/shell/TabLayout'
import { clearOAuthMark } from '@/features/entry/useGoogleSignIn'
import { INVITE_PARAM, readInviteCode } from '@/features/entry/useInvite'
import { InstallScreen } from '@/features/install/InstallScreen'
import {
  SNOOZE_DONE_MS,
  SNOOZE_LATER_MS,
  onNativeInstallPrompt,
  shouldPromptInstall,
  snoozeInstall,
} from '@/features/install/installGate'
import { supabase } from '@/lib/supabase'

/**
 * La zona de junta, carregada quan s'hi entra i no abans.
 *
 * Són vint pantalles que arriben al cinc o deu per cent de la gent —qui és de
 * la junta— i fins ara viatjaven al mateix tros que l'Inici, o sigui a cada
 * telèfon de cada soci la primera vegada que obre l'app, per la wifi que hi
 * hagi. La partició natural ja existia: totes pengen d'una sola branca de
 * l'arbre de rutes.
 *
 * Una per una i no un mòdul que les reexporti: així el que es baixa en obrir
 * `/junta/registre` és el registre, i no també l'escàner i el formulari
 * d'esdeveniment.
 */
const CheckinsScreen = lazy(() =>
  import('@/features/junta/CheckinsScreen').then((m) => ({ default: m.CheckinsScreen })),
)
const CloseMeetingScreen = lazy(() =>
  import('@/features/junta/CloseMeetingScreen').then((m) => ({ default: m.CloseMeetingScreen })),
)
const EventFormScreen = lazy(() =>
  import('@/features/junta/EventFormScreen').then((m) => ({ default: m.EventFormScreen })),
)
const AuditScreen = lazy(() =>
  import('@/features/junta/AuditScreen').then((m) => ({ default: m.AuditScreen })),
)
const GrausScreen = lazy(() =>
  import('@/features/junta/GrausScreen').then((m) => ({ default: m.GrausScreen })),
)
const DashboardScreen = lazy(() =>
  import('@/features/junta/DashboardScreen').then((m) => ({ default: m.DashboardScreen })),
)
const GimcanaFormScreen = lazy(() =>
  import('@/features/junta/GimcanaFormScreen').then((m) => ({ default: m.GimcanaFormScreen })),
)
const GimcanaValidateScreen = lazy(() =>
  import('@/features/junta/GimcanaValidateScreen').then((m) => ({ default: m.GimcanaValidateScreen })),
)
const PhotoReportsScreen = lazy(() =>
  import('@/features/junta/PhotoReportsScreen').then((m) => ({ default: m.PhotoReportsScreen })),
)
const IdeasReviewScreen = lazy(() =>
  import('@/features/junta/IdeasReviewScreen').then((m) => ({ default: m.IdeasReviewScreen })),
)
const MembersScreen = lazy(() =>
  import('@/features/junta/MembersScreen').then((m) => ({ default: m.MembersScreen })),
)
const PeriodsScreen = lazy(() =>
  import('@/features/junta/PeriodsScreen').then((m) => ({ default: m.PeriodsScreen })),
)
const RolesScreen = lazy(() =>
  import('@/features/junta/RolesScreen').then((m) => ({ default: m.RolesScreen })),
)
const ScaleScreen = lazy(() =>
  import('@/features/junta/ScaleScreen').then((m) => ({ default: m.ScaleScreen })),
)
const ManualScreen = lazy(() =>
  import('@/features/door/ManualScreen').then((m) => ({ default: m.ManualScreen })),
)
const PointsScreen = lazy(() =>
  import('@/features/door/PointsScreen').then((m) => ({ default: m.PointsScreen })),
)
const ScannerScreen = lazy(() =>
  import('@/features/door/ScannerScreen').then((m) => ({ default: m.ScannerScreen })),
)
const InvitesScreen = lazy(() =>
  import('@/features/junta/InvitesScreen').then((m) => ({ default: m.InvitesScreen })),
)
const PaymentsScreen = lazy(() =>
  import('@/features/junta/PaymentsScreen').then((m) => ({ default: m.PaymentsScreen })),
)
const JuntaHome = lazy(() =>
  import('@/features/junta/JuntaHome').then((m) => ({ default: m.JuntaHome })),
)


/**
 * The order of the gates, and why.
 *
 * On iOS the home-screen app has its own storage, so a session created in
 * Safari is not there when the icon is tapped. Asking people to install before
 * they sign in is the only order that does not end with somebody opening the
 * icon and finding themselves signed out.
 *
 * It is a prompt, not a wall: skipping it goes straight on to the door.
 */
/**
 * Només per penjar el hook de la cua a l'arbre.
 *
 * Un component i no una crida dins d'`App`: allà hi ha retorns condicionals
 * abans d'aquest punt —la pantalla d'instal·lació, la d'entrada— i un hook
 * darrere d'un `return` és un hook que unes vegades s'executa i altres no.
 */
function DrainCheckins() {
  useCheckinQueue()
  return null
}

export default function App() {
  const { t } = useTranslation()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [promptInstall, setPromptInstall] = useState(() => shouldPromptInstall())

  // A Android el `beforeinstallprompt` sol arribar després del muntatge, i
  // aquest estat es llegeix un sol cop: sense tornar-hi, la pantalla no
  // sortiria mai on hi ha diàleg natiu.
  useEffect(() => {
    return onNativeInstallPrompt(() => {
      setPromptInstall(shouldPromptInstall())
    })
  }, [])

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  // Redeem the invitation once, as soon as there is a session to redeem it
  // against. The code travelled in the redirect URL so this works even when
  // the link is opened on a different device from the one that asked for it.
  useEffect(() => {
    if (!session) return
    // The round trip came back here, so the stranded marker has done its job.
    clearOAuthMark()

    const code = readInviteCode()
    if (code === null) return

    void (async () => {
      const { error } = await supabase.rpc('redeem_invite', { p_codi: code })
      // The code is only rubbed out of the address bar once it has been spent.
      // Removing it either way left somebody pending, with the one string that
      // could have got them in already gone.
      if (error) return
      const url = new URL(window.location.href)
      url.searchParams.delete(INVITE_PARAM)
      window.history.replaceState({}, '', url.toString())
    })()
  }, [session])

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-app">
        <p className="text-fg-muted">{t('state.loading')}</p>
      </main>
    )
  }

  if (promptInstall && !session) {
    return (
      <InstallScreen
        onDone={() => {
          snoozeInstall(SNOOZE_DONE_MS)
          setPromptInstall(false)
        }}
        onLater={() => {
          snoozeInstall(SNOOZE_LATER_MS)
          setPromptInstall(false)
        }}
      />
    )
  }

  if (!session) return <EntryScreen />

  return (
    <UserIdContext value={session.user.id}>
      {/* A l'arrel i no a cap pantalla: es fitxa a la porta i tot seguit es
          guarda el mòbil, o sigui que la pantalla on es va prémer el botó no
          es torna a obrir. */}
      <DrainCheckins />
      <Routes>
        {/* Asked once, and it has to be its own route rather than a gate in
            front of everything: a redirect that fires on every render would
            trap somebody who came in through a shared link to an event. */}
        <Route path="/primer-cop" element={<OnboardingScreen />} />

        <Route element={<RequireOnboarding />}>
          <Route element={<TabLayout />}>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/ranquing" element={<RankingScreen />} />
            <Route path="/qr" element={<QrScreen />} />
            <Route path="/idees" element={<IdeasScreen />} />
            <Route path="/idees/nova" element={<NewIdeaScreen />} />
            <Route path="/perfil" element={<ProfileScreen />} />
            <Route path="/perfil/insignies" element={<BadgesScreen />} />
            <Route path="/perfil/editar" element={<EditProfileScreen />} />
            <Route path="/esdeveniment/:id" element={<EventScreen />} />
            <Route path="/esdeveniment/:eventId/dins" element={<InsideScreen />} />
            <Route path="/esdeveniment/:id/fotos" element={<GalleryScreen />} />
            <Route path="/esdeveniment/:id/gimcana" element={<ProvesScreen />} />
            <Route path="/esdeveniment/:id/gimcana/marcador" element={<ScoreboardScreen />} />
            <Route path="/esdeveniment/:id/gimcana/:provaId" element={<SubmitScreen />} />
            <Route path="/perfil/nits" element={<DiptychScreen />} />
            <Route path="/perfil/nits/:eventId" element={<DiptychScreen />} />
            <Route path="/esdeveniment/:eventId/cotxes" element={<RidesScreen />} />
            <Route path="/esdeveniment/:eventId/cotxes/nou" element={<OfferRideScreen />} />
            <Route path="/esdeveniment/:eventId/cotxes/:rideId" element={<MyRideScreen />} />
          </Route>

          {/* The camera goes outside the tab bar, like the scanner: a tab bar
              over a shutter button is a mis-tap waiting to happen. */}
          <Route path="/perfil/nits/:eventId/camera" element={<DoorPhotoScreen />} />

          {/* No tab bar in here: these are places you go into and come back
              out of, and each one draws its own way out. */}
          <Route
            path="/junta"
            element={
              // Un sol Suspense per a tota la branca: el que es carrega és una
              // pantalla de junta, i totes entren pel mateix lloc. La frase és
              // la mateixa que fa servir l'arrencada de l'app, perquè és la
              // mateixa espera vista des de dins.
              <Suspense
                fallback={
                  <main className="flex min-h-dvh items-center justify-center bg-app">
                    <p className="text-fg-muted">{t('state.loading')}</p>
                  </main>
                }
              >
                <JuntaLayout />
              </Suspense>
            }
          >
            <Route index element={<JuntaHome />} />
            <Route path="invitacions" element={<InvitesScreen />} />
            <Route path="esdeveniment/:id" element={<EventFormScreen />} />
            <Route path="esdeveniment/:id/fitxatges" element={<CheckinsScreen />} />
            <Route path="idees" element={<IdeasReviewScreen />} />
            <Route path="socis" element={<MembersScreen />} />
            <Route path="rols" element={<RolesScreen />} />
            <Route path="reunio/:id/tanca" element={<CloseMeetingScreen />} />
            <Route path="registre" element={<AuditScreen />} />
            <Route path="periodes" element={<PeriodsScreen />} />
            <Route path="barem" element={<ScaleScreen />} />
            <Route path="graus" element={<GrausScreen />} />
            <Route path="fotos" element={<PhotoReportsScreen />} />
            <Route path="tauler" element={<DashboardScreen />} />
            <Route path="esdeveniment/:id/gimcana" element={<GimcanaFormScreen />} />
            <Route path="gimcana/:eventId" element={<GimcanaValidateScreen />} />
            <Route path="pagaments" element={<PaymentsScreen />} />
            <Route path="pagaments/:eventId" element={<PaymentsScreen />} />
            <Route path="escaner/:eventId" element={<ScannerScreen />} />
            <Route path="alta/:eventId" element={<ManualScreen />} />
            <Route path="punts/:eventId" element={<PointsScreen />} />
          </Route>
        </Route>

        {/* A path that does not exist yet, or one left over from a shared link
            to a screen that has not shipped. Home, rather than a 404 nobody
            has designed. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </UserIdContext>
  )
}
