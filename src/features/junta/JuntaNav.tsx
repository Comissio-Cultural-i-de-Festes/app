import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'

import { useMyProfile } from '@/features/session/useMyProfile'
import { Wordmark } from '@/ui/Logo/Logo'

/**
 * The top bar the junta gets on a laptop.
 *
 * Only from `lg` up, and only inside /junta. Everything a member sees keeps
 * its 430-pixel column at every width — the prototype is explicit that the
 * member app does not change on a big screen, it only centres. What does
 * change is the work: writing an event description, going through a payment
 * list of forty people, deciding who gets in. Those are done sitting down.
 *
 * The scanner and the manual check-in are deliberately absent. They happen at
 * a door, with one hand, and a link to them from a laptop would only ever be
 * a mis-tap.
 */

const LINK =
  'flex min-h-[44px] items-center px-[13px] py-4 text-md font-semibold no-underline ' +
  'text-fg-secondary hover:text-fg'
const ACTIVE = 'bg-surface-4 font-bold text-fg'

export function JuntaNav() {
  const { t } = useTranslation()
  const { data: profile } = useMyProfile()

  return (
    <nav
      aria-label={t('junta.title')}
      className="sticky top-0 z-30 hidden min-h-[62px] items-center gap-[34px] border-b border-surface-5 bg-surface-1 px-14 pt-[var(--ds-safe-top)] lg:flex"
    >
      <NavLink
        to="/"
        className="flex min-h-[44px] flex-none items-center no-underline"
        aria-label={t('nav.home')}
      >
        <Wordmark size={19} />
      </NavLink>

      <ul className="flex items-center gap-1">
        {/* /junta is the rebedor now, and everything else on this bar is
            reachable from it — so it is named for what it is, and the
            configuration rows live there rather than as a fifth item. */}
        <Item to="/junta" end label={t('junta.title')} />
        <Item to="/junta/invitacions" label={t('junta.invites.title')} />
        <Item to="/junta/pagaments" label={t('junta.payments.title')} />
        <Item to="/junta/socis" label={t('junta.members.title')} />
        <Item to="/ranquing" label={t('nav.ranking')} />
      </ul>

      <span className="flex-1" />

      <NavLink
        to="/perfil"
        className="flex min-h-[44px] items-center gap-4 text-sm font-semibold text-fg-secondary no-underline"
      >
        {profile?.nombre ?? ''}
      </NavLink>
    </nav>
  )
}

function Item({
  to,
  label,
  end = false,
}: {
  readonly to: string
  readonly label: string
  readonly end?: boolean
}) {
  return (
    <li>
      <NavLink to={to} end={end} className={({ isActive }) => `${LINK} ${isActive ? ACTIVE : ''}`}>
        {label}
      </NavLink>
    </li>
  )
}
