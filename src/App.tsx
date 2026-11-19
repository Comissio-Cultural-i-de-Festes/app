import { useQueryClient } from '@tanstack/react-query'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router'

import { EntryScreen } from '@/features/entry/EntryScreen'
import { HomeScreen } from '@/features/home/HomeScreen'
import { useCheckinQueue } from '@/features/checkin/useCheckinQueue'
import { useKeepPushFresh } from '@/features/event/useKeepPushFresh'
import { UserIdContext } from '@/features/session/context'
import { useBootSession } from '@/features/session/useBootSession'
import { useQrPrefetch } from '@/features/qr/useQrPrefetch'
import { JuntaLayout } from '@/features/shell/JuntaLayout'
import { GateWaiting } from '@/features/shell/Gate'
import { SessionGate } from '@/features/shell/SessionGate'
import { RequireOnboarding } from '@/features/shell/RequireOnboarding'
import { TabLayout } from '@/features/shell/TabLayout'
import { clearOAuthMark } from '@/features/entry/useGoogleSignIn'
import { discardInvite, pendingInvite } from '@/features/entry/pendingInvite'
import { ReturnToLink } from '@/features/entry/ReturnToLink'
import { forgetReturn } from '@/features/entry/returnTo'
import { useForgetReturn } from '@/features/entry/useForgetReturn'
import { readInviteCode } from '@/features/entry/useInvite'
import { useRedeemFromLink } from '@/features/entry/useRedeemFromLink'
import { InstallScreen } from '@/features/install/InstallScreen'
import {
  SNOOZE_DONE_MS,
  SNOOZE_LATER_MS,
  onNativeInstallPrompt,
  shouldPromptInstall,
  snoozeInstall,
} from '@/features/install/installGate'
import { forgetOnUserChange } from '@/lib/forgetSession'
import { useStalled } from '@/lib/useAvailability'
import { useOnline } from '@/lib/useOnline'

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
const HoresEventScreen = lazy(() =>
  import('@/features/junta/HoresEventScreen').then((m) => ({ default: m.HoresEventScreen })),
)
const HoresScreen = lazy(() =>
  import('@/features/junta/HoresScreen').then((m) => ({ default: m.HoresScreen })),
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
  import('@/features/junta/GimcanaValidateScreen').then((m) => ({
    default: m.GimcanaValidateScreen,
  })),
)
const PhotoReportsScreen = lazy(() =>
  import('@/features/junta/PhotoReportsScreen').then((m) => ({ default: m.PhotoReportsScreen })),
)
const IdeasReviewScreen = lazy(() =>
  import('@/features/junta/IdeasReviewScreen').then((m) => ({ default: m.IdeasReviewScreen })),
)
const MemberScreen = lazy(() =>
  import('@/features/junta/MemberScreen').then((m) => ({ default: m.MemberScreen })),
)
const AvisPendentFormScreen = lazy(() =>
  import('@/features/junta/AvisPendentFormScreen').then((m) => ({
    default: m.AvisPendentFormScreen,
  })),
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
 * Les pantalles de soci, també a demanda, totes menys l'Inici.
 *
 * El primer que baixa un telèfon era l'app sencera: qui arriba amb la
 * invitació, per la wifi de la casa rural, s'enduia el rànquing, la gimcana i
 * els cotxes per veure una porta amb un botó. Ara baixa la porta i l'Inici, i
 * la resta quan s'hi entra. Un cop instal·lada no costa res: el service worker
 * té tots aquests trossos a la precache, o sigui que sense xarxa s'obren igual.
 *
 * L'Inici no. Es va provar diferit i el LCP empitjorava: és la primera
 * pantalla de qui ja ha entrat, i fer-la esperar un tros que només es pot
 * demanar quan l'entrada ja s'ha executat és afegir un viatge sencer davant
 * del que es mesura. Tampoc la d'entrada ni la d'instal·lació, pel mateix
 * motiu des de l'altra banda: són el primer que veu qui encara no ha entrat.
 */
const EventScreen = lazy(() =>
  import('@/features/event/EventScreen').then((m) => ({ default: m.EventScreen })),
)
const InsideScreen = lazy(() =>
  import('@/features/event/InsideScreen').then((m) => ({ default: m.InsideScreen })),
)
const DiptychScreen = lazy(() =>
  import('@/features/photos/DiptychScreen').then((m) => ({ default: m.DiptychScreen })),
)
const DoorPhotoScreen = lazy(() =>
  import('@/features/photos/DoorPhotoScreen').then((m) => ({ default: m.DoorPhotoScreen })),
)
const IdeasScreen = lazy(() =>
  import('@/features/proposals/IdeasScreen').then((m) => ({ default: m.IdeasScreen })),
)
const NewIdeaScreen = lazy(() =>
  import('@/features/proposals/NewIdeaScreen').then((m) => ({ default: m.NewIdeaScreen })),
)
const MyRideScreen = lazy(() =>
  import('@/features/rides/MyRideScreen').then((m) => ({ default: m.MyRideScreen })),
)
const OfferRideScreen = lazy(() =>
  import('@/features/rides/OfferRideScreen').then((m) => ({ default: m.OfferRideScreen })),
)
const RidesScreen = lazy(() =>
  import('@/features/rides/RidesScreen').then((m) => ({ default: m.RidesScreen })),
)
const SociScreen = lazy(() =>
  import('@/features/member/SociScreen').then((m) => ({ default: m.SociScreen })),
)
const RankingScreen = lazy(() =>
  import('@/features/ranking/RankingScreen').then((m) => ({ default: m.RankingScreen })),
)
const OnboardingScreen = lazy(() =>
  import('@/features/onboarding/OnboardingScreen').then((m) => ({ default: m.OnboardingScreen })),
)
const BadgesScreen = lazy(() =>
  import('@/features/badges/BadgesScreen').then((m) => ({ default: m.BadgesScreen })),
)
const GalleryScreen = lazy(() =>
  import('@/features/gallery/GalleryScreen').then((m) => ({ default: m.GalleryScreen })),
)
const ProvesScreen = lazy(() =>
  import('@/features/gimcana/ProvesScreen').then((m) => ({ default: m.ProvesScreen })),
)
const ScoreboardScreen = lazy(() =>
  import('@/features/gimcana/ScoreboardScreen').then((m) => ({ default: m.ScoreboardScreen })),
)
const SubmitScreen = lazy(() =>
  import('@/features/gimcana/SubmitScreen').then((m) => ({ default: m.SubmitScreen })),
)
const EditProfileScreen = lazy(() =>
  import('@/features/profile/EditProfileScreen').then((m) => ({ default: m.EditProfileScreen })),
)
const ProfileScreen = lazy(() =>
  import('@/features/profile/ProfileScreen').then((m) => ({ default: m.ProfileScreen })),
)
const QrScreen = lazy(() => import('@/features/qr/QrScreen').then((m) => ({ default: m.QrScreen })))
const PrivacyScreen = lazy(() =>
  import('@/features/legal/PrivacyScreen').then((m) => ({ default: m.PrivacyScreen })),
)
const TermsScreen = lazy(() =>
  import('@/features/legal/TermsScreen').then((m) => ({ default: m.TermsScreen })),
)

/**
 * Les dues rutes que es llegeixen sense sessió.
 *
 * Exportades perquè les enllacen tres pantalles i cap d'elles ha de repetir la
 * cadena: si un dia canvien de nom, canvien aquí i prou.
 */
export const PRIVACY_PATH = '/privadesa'
export const TERMS_PATH = '/condicions'

/** Vegeu la porta de la sessió, a `App`. */
const OFFLINE_GRACE_MS = 500

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

/** El mateix per al QR: es desa en entrar, i no el dia que es busca a la porta. */
function PrefetchQr() {
  useQrPrefetch()
  return null
}

function KeepPushFresh() {
  useKeepPushFresh()
  return null
}

/**
 * On s'espera una pantalla de soci que encara no ha arribat.
 *
 * Una ruta sense camí entre la barra de pestanyes i les pantalles, i no un
 * `Suspense` al voltant de tot l'arbre: així el que es substitueix mentre
 * arriba el tros és la pantalla, i la barra no desapareix i torna.
 */
function ScreenOutlet() {
  return (
    <Suspense fallback={<GateWaiting />}>
      <Outlet />
    </Suspense>
  )
}

/**
 * L'app, darrere de l'espera de l'idioma.
 *
 * Qui ha triat el castellà o l'anglès no el té dins del paquet (vegeu
 * `i18n/index.ts`), i fins que arriba `useTranslation` suspèn. Aquí es
 * pinta el fons de l'app i res més: qualsevol frase, fins i tot «Un segon…»,
 * sortiria en català a qui no l'ha triat. Amb el català no s'arriba a veure;
 * amb un altre ja desat, dura el que es triga a llegir-lo de la precache.
 */
export default function App() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-app" />}>
      <Gates />
    </Suspense>
  )
}

/**
 * The order of the gates, and why.
 *
 * On iOS the home-screen app has its own storage, so a session created in
 * Safari is not there when the icon is tapped. Asking people to install before
 * they sign in is the only order that does not end with somebody opening the
 * icon and finding themselves signed out.
 *
 * Unless the link carries an invitation. The code lives only in the URL, and
 * the icon opens `/` in a storage jar that has never seen it, so installing
 * first meant arriving at the icon's door as a stranger. With a code the door
 * goes first, the code is redeemed right there in Safari, and the account is
 * active on the server before anybody installs anything; from the icon it
 * takes one more Google sign-in and nothing else. `InstallCard` offers the
 * install afterwards, on the home screen. Android's native dialog steps aside
 * too, because accepting it can open the installed app at `/` just the same.
 *
 * It is a prompt, not a wall: skipping it goes straight on to the door.
 */
function Gates() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const lastUser = useRef<string | null>(null)
  const signedIn = useRef(false)
  const { phase, session } = useBootSession({
    onRead: (read) => {
      lastUser.current = read?.user.id ?? null
      signedIn.current = read !== null
    },
    onChange: (event, next) => {
      // Aquí i no al botó del perfil: també es tanca sessió quan el token ja
      // no es pot refrescar, o des d'una altra pestanya. Un codi que esperava
      // el bescanvi era del compte que se'n va, i el següent que entri en
      // aquesta pestanya no se l'ha de quedar, ni del desat ni de la barra.
      //
      // Només si algú l'havia començat a fer servir. Una sessió vella que no
      // es pot refrescar també dona `SIGNED_OUT`, en arrencar i abans de tot:
      // esborrar-hi el `?codi=` deixaria qui acaba d'obrir l'enllaç sense la
      // invitació a la porta.
      if (event === 'SIGNED_OUT' && (signedIn.current || pendingInvite() !== null)) {
        discardInvite()
        forgetReturn()
      }
      signedIn.current = next !== null
      // Abans de pintar res amb la sessió nova: qui entra no ha de veure ni un
      // instant el que tenia a la cau qui marxa.
      lastUser.current = forgetOnUserChange(client, lastUser.current, next?.user.id ?? null)
    },
  })
  const stalled = useStalled(phase === 'waiting')
  const online = useOnline()
  const offlineSettled = useStalled(phase === 'waiting' && !online, 0, OFFLINE_GRACE_MS)
  const { pathname } = useLocation()
  // Llegit en muntar, abans que el bescanvi l'esborri de la barra d'adreces. A
  // partir d'aquí ja hi ha sessió, i la pantalla d'instal·lació no torna.
  const [invited] = useState(() => readInviteCode() !== null)
  const [promptInstall, setPromptInstall] = useState(() =>
    shouldPromptInstall(Date.now(), { invited }),
  )

  // A Android el `beforeinstallprompt` sol arribar després del muntatge, i
  // aquest estat es llegeix un sol cop: sense tornar-hi, la pantalla no
  // sortiria mai on hi ha diàleg natiu.
  useEffect(() => {
    return onNativeInstallPrompt(() => {
      setPromptInstall(shouldPromptInstall(Date.now(), { invited }))
    })
  }, [invited])

  useRedeemFromLink(session?.user.id ?? null)

  useEffect(() => {
    // The round trip came back here, so the stranded marker has done its job.
    if (session) clearOAuthMark()
  }, [session])

  useForgetReturn(session?.user.id ?? null)

  // Tornar-ho a provar és recarregar, i no tornar a cridar `getSession()`: una
  // renovació penjada no es deixa substituir —la biblioteca hi enganxa la
  // crida nova— i la que ha fallat queda desada un minut. Recarregar és l'única
  // manera de llançar-ne una de nova, i l'app la serveix el service worker
  // també sense xarxa.
  const reload = (): void => {
    window.location.reload()
  }

  // Sense xarxa, supabase-js s'hi passa uns vint-i-cinc segons reintentant la
  // renovació abans de rendir-se. No cal esperar-lo per dir-ho: si el
  // navegador diu que no hi ha xarxa, és que no n'hi ha. Però no al primer
  // frame: amb una sessió vàlida `getSession()` contesta en mil·lisegons sense
  // tocar la xarxa, i en mode avió tothom veia una frase vermella un instant
  // abans d'entrar. Mig segon de «Un segon…» primer.
  if (phase === 'waiting') {
    if (offlineSettled) {
      return <SessionGate message={t('errors.sessionUnreachable')} onRetry={reload} />
    }
    return stalled ? (
      <SessionGate message={t('errors.stalled')} onRetry={reload} />
    ) : (
      <GateWaiting />
    )
  }

  // ── El que es llegeix sense haver entrat ──────────────────────────────────
  //
  // Les dues pantalles legals van DAVANT dels dos porters de sota, i és tot el
  // sentit que tenen: qui encara no ha entrat ha de poder saber què li passarà
  // a les seves dades abans de decidir entrar-hi. Enllaçar-les des de la porta
  // i declarar-les dins de l'arbre de sota no serviria de res —el `return` de
  // la sessió mata l'enrutament abans d'arribar-hi, i el catch-all reboteria el
  // visitant a l'Inici sense cap explicació.
  //
  // També van davant del porter d'instal·lació, que dispara encara abans que
  // el de la sessió: si no, la primera visita des de Safari se les menjaria.
  //
  // El `*` torna l'arbre de sempre, o sigui que per a tota la resta això no hi
  // és.
  if (pathname === PRIVACY_PATH || pathname === TERMS_PATH) {
    return (
      <Suspense fallback={<GateWaiting />}>
        {pathname === PRIVACY_PATH ? <PrivacyScreen /> : <TermsScreen />}
      </Suspense>
    )
  }

  // Hi ha una sessió desada que no s'ha pogut renovar. La pantalla d'entrada
  // seria mentir —ja has entrat— i, a més, no hi ha res que s'hi pugui fer
  // sense xarxa. Davant del porter d'instal·lació pel mateix motiu: aquell és
  // per a qui encara no ha entrat.
  //
  // «Sense connexió» només si el navegador ho diu. La biblioteca també dona
  // per reintentable un 502, 503 o 504 del servidor d'entrada, i allà la
  // cobertura no hi té res a veure.
  if (!session && phase === 'unreachable') {
    return (
      <SessionGate
        message={t(online ? 'errors.network' : 'errors.sessionUnreachable')}
        onRetry={reload}
      />
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
      <PrefetchQr />
      <KeepPushFresh />
      <Routes>
        {/* Asked once, and it has to be its own route rather than a gate in
            front of everything: a redirect that fires on every render would
            trap somebody who came in through a shared link to an event. */}
        <Route element={<ScreenOutlet />}>
          <Route path="/primer-cop" element={<OnboardingScreen />} />
        </Route>

        <Route element={<RequireOnboarding />}>
          <Route element={<TabLayout />}>
            <Route
              path="/"
              element={
                <>
                  <ReturnToLink />
                  <HomeScreen />
                </>
              }
            />
            <Route element={<ScreenOutlet />}>
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
          </Route>

          <Route element={<ScreenOutlet />}>
            {/* The camera goes outside the tab bar, like the scanner: a tab bar
                over a shutter button is a mis-tap waiting to happen. */}
            <Route path="/perfil/nits/:eventId/camera" element={<DoorPhotoScreen />} />

            {/* El perfil d'un altre soci, també fora de la barra: s'hi entra des
                d'una cara en una llista i se'n torna a sortir per on s'ha
                entrat, que és el que la fletxa de la capçalera sap fer i una
                pestanya marcada no. */}
            <Route path="/soci/:id" element={<SociScreen />} />
          </Route>

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
            <Route path="esdeveniment/:id/hores" element={<HoresEventScreen />} />
            <Route path="hores" element={<HoresScreen />} />
            <Route path="idees" element={<IdeasReviewScreen />} />
            <Route path="socis" element={<MembersScreen />} />
            <Route path="socis/:id" element={<MemberScreen />} />
            <Route path="pendents/nou" element={<AvisPendentFormScreen />} />
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
