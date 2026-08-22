import { Fragment, type ReactNode } from 'react'

import { HomeIcon, ProfileIcon, ProposalsIcon, QrIcon, RankingIcon } from './icons'

/**
 * The bottom tab bar.
 *
 * A PWA gets no native chrome, so this is the app's only persistent
 * navigation. Five slots, with My QR in the centre as a brand-coloured action
 * rather than a tab, because it is the one thing people open the app to do
 * while standing at a door.
 *
 * Content clears the bar with the `.with-tabbar` class from base.css, which
 * screens that have one opt into. The offset token is derived from the same
 * padding values used here, so the two cannot drift — and the screens without
 * a tab bar, like the door and the install steps, do not get a dead band at
 * the bottom.
 *
 * It is a `<nav>` of links, not `role="tablist"`: ARIA tabs imply same-page
 * panels and hijack the arrow keys. Callers pass `href` and `current`
 * themselves, and `renderLink` if those hrefs should be handled by a router
 * rather than by the browser — the bar itself knows nothing about routing, so
 * it can be rendered in a test or a gallery without one.
 */

export type TabId = 'home' | 'ranking' | 'qr' | 'proposals' | 'profile'

export interface TabLinkProps {
  readonly href: string
  readonly className: string
  readonly 'aria-current': 'page' | undefined
  readonly children: ReactNode
}

export interface TabBarProps {
  /** Which tab is the current page. */
  readonly current: TabId
  /** `href` per tab. A tab with no href renders disabled. */
  readonly hrefs: Partial<Record<TabId, string>>
  /** Localised labels, keyed by tab. Never hardcode copy in here. */
  readonly labels: Record<TabId, string>
  /** Localised name for the landmark, e.g. "Navegació principal". */
  readonly navLabel: string
  /** Localised suffix announced on a tab that has not shipped yet. */
  readonly comingSoonLabel: string
  /**
   * How to render a link. Defaults to a plain `<a>`, which reloads the page —
   * fine in isolation, wrong inside the app, where the shell passes a router
   * link instead.
   */
  readonly renderLink?: (props: TabLinkProps) => ReactNode
}

const defaultLink = ({ href, className, children, ...rest }: TabLinkProps): ReactNode => (
  <a href={href} className={className} aria-current={rest['aria-current']}>
    {children}
  </a>
)

const ICONS: Record<TabId, (p: { className?: string }) => ReactNode> = {
  home: HomeIcon,
  ranking: RankingIcon,
  qr: QrIcon,
  proposals: ProposalsIcon,
  profile: ProfileIcon,
}

const ORDER: readonly TabId[] = ['home', 'ranking', 'qr', 'proposals', 'profile']

const ITEM =
  'flex min-h-[var(--ds-tabbar-item-h)] flex-col items-center justify-end gap-[var(--ds-gap-xs)] ' +
  'bg-transparent p-0 [touch-action:manipulation] [-webkit-tap-highlight-color:transparent]'

export function TabBar({
  current,
  hrefs,
  labels,
  navLabel,
  comingSoonLabel,
  renderLink = defaultLink,
}: TabBarProps) {
  return (
    <nav
      aria-label={navLabel}
      className={
        'fixed bottom-0 left-1/2 z-40 grid w-full max-w-[var(--ds-shell-max-w)] ' +
        '-translate-x-1/2 grid-cols-5 border-t border-border bg-bar ' +
        'pt-[var(--ds-tabbar-pad-t)] pr-[var(--ds-tabbar-pad-x)] pl-[var(--ds-tabbar-pad-x)] ' +
        'pb-[calc(var(--ds-tabbar-pad-b)+var(--ds-safe-bottom))] ' +
        'backdrop-blur-[var(--ds-blur-bar)] ' +
        'supports-[not_(backdrop-filter:blur(1px))]:bg-[var(--ds-bg-bar-solid)]'
      }
    >
      {ORDER.map((id) => {
        const Icon = ICONS[id]
        const href = hrefs[id]
        const isCurrent = current === id
        const isCentre = id === 'qr'

        // The centre slot is an action, not a tab: a 44x44 brand square.
        const glyph = isCentre ? (
          <span className="grid size-[44px] place-items-center rounded-card bg-brand text-on-brand shadow-brand">
            <Icon />
          </span>
        ) : (
          <Icon
            className={
              isCurrent ? 'h-[21px] w-[21px] text-brand-icon' : 'h-[21px] w-[21px] text-fg-dim'
            }
          />
        )

        const label = (
          <span
            className={
              'text-3xs leading-none whitespace-nowrap ' +
              (isCurrent
                ? 'font-bold text-brand-label'
                : 'font-medium text-[var(--ds-text-muted-lo)]')
            }
          >
            {labels[id]}
          </span>
        )

        // A tab whose screen has not shipped yet. `disabled` rather than
        // `opacity` alone: a dimmed link is still focusable and still goes
        // nowhere, and `pointer-events: none` would hide it from a screen
        // reader instead of explaining it.
        if (href === undefined) {
          return (
            <button
              key={id}
              type="button"
              disabled
              aria-label={`${labels[id]}, ${comingSoonLabel}`}
              className={`${ITEM} cursor-default border-0 opacity-45`}
            >
              {glyph}
              {label}
            </button>
          )
        }

        return (
          <Fragment key={id}>
            {renderLink({
              href,
              className: `${ITEM} no-underline`,
              'aria-current': isCurrent ? 'page' : undefined,
              children: (
                <>
                  {glyph}
                  {label}
                </>
              ),
            })}
          </Fragment>
        )
      })}
    </nav>
  )
}
