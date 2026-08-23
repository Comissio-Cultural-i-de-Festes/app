import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router'

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
  profile: '/perfil',
}

function currentTab(pathname: string): TabId {
  if (pathname.startsWith('/ranquing')) return 'ranking'
  if (pathname.startsWith('/qr')) return 'qr'
  if (pathname.startsWith('/perfil')) return 'profile'
  return 'home'
}

export function TabLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  return (
    <>
      <Outlet />
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
          <Link to={href} className={className} aria-current={rest['aria-current']}>
            {children}
          </Link>
        )}
      />
    </>
  )
}
