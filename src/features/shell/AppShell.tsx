import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { TabBar, type TabId } from '@/ui/TabBar/TabBar'

/**
 * Everything behind the door: the page, plus the bar underneath it.
 *
 * The tabs whose screens have not been built yet have no href, which is what
 * makes the bar render them disabled and announce "properament" rather than
 * pretending. They light up as the screens land.
 */
const HREFS: Partial<Record<TabId, string>> = {
  home: '/',
  ranking: '/ranquing',
}

export function AppShell({ current, children }: { readonly current: TabId; children: ReactNode }) {
  const { t } = useTranslation()

  return (
    <>
      {children}
      <TabBar
        current={current}
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
        renderLink={({ href, className, children: content, ...rest }) => (
          <Link to={href} className={className} aria-current={rest['aria-current']}>
            {content}
          </Link>
        )}
      />
    </>
  )
}
