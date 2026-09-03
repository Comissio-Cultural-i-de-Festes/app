import type { ReactNode } from 'react'
import { Link } from 'react-router'

/**
 * The way out of a junta screen.
 *
 * These screens have no tab bar — they are a place you go into and come back
 * out of — so every one of them has to draw its own exit, and the prototype
 * draws the same one on all of them: a back chevron with where it goes.
 */
/*
 * S'enganxa a `--ds-sticky-top` i no a zero. Amb `top-0` es pinta al capdamunt
 * de la finestra, que és on hi ha la banda de pendent quan algú encara espera
 * que la junta l'accepti: el títol quedava a sota d'ella. La funció 1 va
 * introduir el token i va arreglar l'Inici i el Rànquing, i aquest capçal
 * —que és el de les altres tretze pantalles— es va quedar enrere.
 *
 * Quan no hi ha banda, `--ds-sticky-top` val zero i això és exactament `top-0`.
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
      className={`sticky top-[var(--ds-sticky-top)] z-20 border-b border-surface-5 bg-app px-[var(--ds-gutter)] pt-[max(calc(var(--ds-safe-top)+4px),12px)] pb-4 ${className}`}
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
