import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes } from 'react-router'

import { EntryScreen } from '@/features/entry/EntryScreen'
import { EventScreen } from '@/features/event/EventScreen'
import { HomeScreen } from '@/features/home/HomeScreen'
import { EventFormScreen } from '@/features/junta/EventFormScreen'
import { ManualScreen } from '@/features/door/ManualScreen'
import { PointsScreen } from '@/features/door/PointsScreen'
import { ScannerScreen } from '@/features/door/ScannerScreen'
import { InvitesScreen } from '@/features/junta/InvitesScreen'
import { PaymentsScreen } from '@/features/junta/PaymentsScreen'
import { JuntaHome } from '@/features/junta/JuntaHome'
import { RankingScreen } from '@/features/ranking/RankingScreen'
import { UserIdContext } from '@/features/session/context'
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen'
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
  shouldPromptInstall,
  snoozeInstall,
} from '@/features/install/installGate'
import { supabase } from '@/lib/supabase'

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
export default function App() {
  const { t } = useTranslation()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [promptInstall, setPromptInstall] = useState(() => shouldPromptInstall())

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
      await supabase.rpc('redeem_invite', { p_codi: code })
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
            <Route path="/perfil" element={<ProfileScreen />} />
            <Route path="/esdeveniment/:id" element={<EventScreen />} />
          </Route>

          {/* No tab bar in here: these are places you go into and come back
              out of, and each one draws its own way out. */}
          <Route path="/junta" element={<JuntaLayout />}>
            <Route index element={<JuntaHome />} />
            <Route path="invitacions" element={<InvitesScreen />} />
            <Route path="esdeveniment/:id" element={<EventFormScreen />} />
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
