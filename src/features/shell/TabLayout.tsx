import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router'

import { PendingBanner } from '@/features/session/PendingBanner'
import { usePendingBanner } from '@/features/session/pendingState'
import { TabBar, type TabId } from '@/ui/TabBar/TabBar'

/**
 * Everything that sits above the tab bar.
 *
 * A layout route rather than a wrapper per screen: with a dozen routes the
 * wrapper version means the bar is re-mounted on every navigation, which on a
 * backdrop-blurred fixed element is a visible flicker, and it means twelve
 * places to forget it.
 *
 * The event screen lives under here too even though it is not a tab. It is
 * reached from the home screen and the bar has to stay put — a screen that
 * loses the navigation is a screen people leave by closing the app.
 *
 * La banda de pendent hi és pel mateix motiu que la barra: és cromàtica de
 * l'aplicació i no d'una pantalla. Aquí es munta un sol cop i les cinc
 * pestanyes no han de saber que existeix; abans era un avís dins de
 * `HomeScreen` que desapareixia en tocar qualsevol altra pestanya, i deixava
 * el QR buit i el botó desactivat del Rànquing sense cap explicació a la
 * vista.
 *
 * `.with-banner` va al contenidor de l'`Outlet` i no a les pantalles perquè
 * aquí és l'únic lloc que sap si la banda hi és i com està col·locada: només
 * fa falta amb la banda plegada, que és la que és `fixed` i per tant no ocupa
 * lloc. Desplegada va al flux i empeny.
 */

/**
 * A tab with no href renders disabled and announces itself as not ready yet.
 * Entries land here as their screens do — an href pointing at a route that
 * does not exist yet would fall through to the catch-all and bounce the person
 * back home, which reads as a bug rather than as "not built".
 */
const HREFS: Partial<Record<TabId, string>> = {
  home: '/',
  ranking: '/ranquing',
  qr: '/qr',
  proposals: '/idees',
  profile: '/perfil',
}

function currentTab(pathname: string): TabId {
  if (pathname.startsWith('/ranquing')) return 'ranking'
  if (pathname.startsWith('/qr')) return 'qr'
  if (pathname.startsWith('/idees')) return 'proposals'
  if (pathname.startsWith('/perfil')) return 'profile'
  return 'home'
}

export function TabLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const banner = usePendingBanner()

  return (
    <>
      {/* El coixí només quan la banda està plegada i per tant és `fixed`.
          Desplegada va al flux i ja empeny ella mateixa. */}
      <div className={banner.showing && banner.collapsed ? 'with-banner' : ''}>
        <PendingBanner {...banner} />
        <Outlet />
      </div>
      <TabBar
        current={currentTab(pathname)}
        hrefs={HREFS}
        navLabel={t('a11y.tabBar')}
        comingSoonLabel={t('a11y.comingSoon')}
        labels={{
          home: t('nav.home'),
          ranking: t('nav.ranking'),
          qr: t('nav.qr'),
          proposals: t('nav.proposals'),
          profile: t('nav.profile'),
        }}
        renderLink={({ href, className, children, ...rest }) => (
          <Link
            to={href}
            className={className}
            aria-label={rest['aria-label']}
            aria-current={rest['aria-current']}
          >
            {children}
          </Link>
        )}
      />
    </>
  )
}
