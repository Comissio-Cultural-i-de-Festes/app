import type { ReactNode } from 'react'
import { Link } from 'react-router'

/**
 * The way out of a junta screen.
 *
 * These screens have no tab bar — they are a place you go into and come back
 * out of — so every one of them has to draw its own exit, and the prototype
 * draws the same one on all of them: a back chevron with where it goes.
 */
export function JuntaHeader({
  to,
  label,
  title,
  aside,
  className = '',
}: {
  readonly to: string
  readonly label: string
  readonly title?: string
  readonly aside?: ReactNode
  /** `lg:hidden` on the screens that grow a top bar instead. */
  readonly className?: string
}) {
  return (
    <header
      className={`sticky top-0 z-20 border-b border-surface-5 bg-app px-[var(--ds-gutter)] pt-[max(calc(var(--ds-safe-top)+4px),12px)] pb-4 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <Link
          to={to}
          className="-ml-2 flex min-h-[44px] items-center gap-1 px-2 text-md font-bold text-fg-muted no-underline"
        >
          <span aria-hidden="true" className="text-lg">
            ‹
          </span>
          {label}
        </Link>
        {aside}
      </div>
      {title === undefined ? null : (
        <h1 className="display mt-1 text-d-s tracking-[-0.045em] [text-wrap:balance]">{title}</h1>
      )}
    </header>
  )
}
